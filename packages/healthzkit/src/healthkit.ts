import { format } from "./formatter/index.ts";
import { computeRollupStatus } from "./rollup.ts";
import { runChecks } from "./runner.ts";
import { Scheduler } from "./scheduler.ts";
import type {
  AgnosticRequest,
  AgnosticResponse,
  CheckStatus,
  CheckType,
  HealthkitConfig,
  HealthResponse,
} from "./types.ts";

const DEFAULT_BASE_PATH = "/healthz";
const DEFAULT_FAIL_STATUS = 503;
const DEFAULT_DEGRADED_STATUS = 200;
const MAX_TIMER_MS = 2_147_483_647;

function validateTimer(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_TIMER_MS) {
    throw new RangeError(`${field} must be an integer between 1 and ${MAX_TIMER_MS} milliseconds.`);
  }
}

export class HealthKit {
  private scheduler: Scheduler;
  private started = false;
  private closing: Promise<void> | undefined;
  private requests = new Set<Promise<unknown>>();

  private draining = false;

  constructor(private config: HealthkitConfig) {
    this.config = {
      ...config,
      defaults: config.defaults && { ...config.defaults },
      checks: config.checks.map((check) => ({
        ...check,
        type: [...check.type],
        schedule: check.schedule && { ...check.schedule },
      })),
    };
    if (this.config.defaults?.timeout !== undefined) {
      validateTimer(this.config.defaults.timeout, "defaults.timeout");
    }
    const names = new Set<string>();
    for (const check of this.config.checks) {
      if (names.has(check.name)) {
        throw new Error(`Duplicate check name "${check.name}". Check names must be unique.`);
      }
      names.add(check.name);
      if (check.timeout !== undefined) {
        validateTimer(check.timeout, `Check "${check.name}" timeout`);
      }
      if (check.schedule) {
        validateTimer(check.schedule.intervalMs, `Check "${check.name}" schedule.intervalMs`);
      }
    }
    this.scheduler = new Scheduler(this.config.hooks);
  }

  start(): void {
    this.assertOpen();
    if (this.started) return;
    this.scheduler.start(this.config.checks, this.config.defaults?.timeout);
    this.started = true;
  }

  stop(): void {
    this.scheduler.stop();
    this.started = false;
  }

  /** Terminal shutdown: wait for underlying checks, then attempt every adapter's cleanup. */
  close(): Promise<void> {
    if (this.closing) return this.closing;
    // Defer cleanup so the terminal flag is set before any user callback can run.
    this.closing = Promise.resolve().then(async () => {
      await Promise.allSettled(this.requests);
      await this.scheduler.settle();
      this.stop();
      const adapters = new Set(this.config.checks.map((check) => check.adapter));
      const results = await Promise.allSettled(
        [...adapters].map(async (adapter) => adapter.dispose?.()),
      );
      const errors = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      if (errors.length) throw new AggregateError(errors, "HealthKit adapter cleanup failed");
    });
    this.scheduler.stopTimers();
    return this.closing;
  }

  private assertOpen(): void {
    if (this.closing) throw new Error("HealthKit is closed");
  }

  /** Permanently fail readiness for this instance. Scheduling and liveness are independent. */
  beginDrain(): void {
    this.draining = true;
  }

  async handleStartup(): Promise<AgnosticResponse> {
    return this.runForType("startup");
  }

  async handleLiveness(): Promise<AgnosticResponse> {
    return this.runForType("liveness");
  }

  async handleReadiness(): Promise<AgnosticResponse> {
    return this.runForType("readiness");
  }

  async checkLiveness(): Promise<HealthResponse> {
    return this.checkForType("liveness");
  }
  async checkReadiness(): Promise<HealthResponse> {
    return this.checkForType("readiness");
  }
  async checkStartup(): Promise<HealthResponse> {
    return this.checkForType("startup");
  }

  /** True for the live, ready, and startup routes. Does not run checks. */
  matchHealthPath(path: string): boolean {
    const basePath = this.config.basePath ?? DEFAULT_BASE_PATH;
    return ["live", "ready", "startup"].some((route) => path === `${basePath}/${route}`);
  }

  async handleRequest(req: AgnosticRequest): Promise<AgnosticResponse | null> {
    const basePath = this.config.basePath ?? DEFAULT_BASE_PATH;
    const { path } = req;
    if (!this.matchHealthPath(path)) return null;
    const method = (req.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      return { status: 405, headers: { Allow: "GET, HEAD" }, body: "" };
    }
    const response = await (path === `${basePath}/live`
      ? this.handleLiveness()
      : path === `${basePath}/ready`
        ? this.handleReadiness()
        : this.handleStartup());
    return method === "HEAD" ? { ...response, body: "" } : response;
  }

  private runForType(type: CheckType): Promise<AgnosticResponse> {
    this.assertOpen();
    const request = this.runForTypeOpen(type);
    this.requests.add(request);
    void request.then(
      () => this.requests.delete(request),
      () => this.requests.delete(request),
    );
    return request;
  }

  private async runForTypeOpen(type: CheckType): Promise<AgnosticResponse> {
    const checks = this.config.checks.filter((c) => c.type.includes(type));
    const response = await this.checkForTypeOpen(type);
    if (type === "readiness" && this.draining) {
      response.status = "fail";
      response.checks = {};
    }
    const publicResponse =
      this.config.output?.exposeError === false
        ? {
            ...response,
            checks: Object.fromEntries(
              Object.entries(response.checks).map(([name, result]) => {
                const { error: _error, ...publicResult } = result;
                return [name, publicResult];
              }),
            ),
          }
        : response;
    const { body, contentType } = format(publicResponse, this.config.output?.format);
    const httpStatus =
      type === "readiness" && this.draining
        ? DEFAULT_FAIL_STATUS
        : this.resolveHttpStatus(response.status, checks, response.checks);

    return { status: httpStatus, headers: { "Content-Type": contentType }, body };
  }

  private checkForType(type: CheckType): Promise<HealthResponse> {
    this.assertOpen();
    const request = this.checkForTypeOpen(type);
    this.requests.add(request);
    void request.then(
      () => this.requests.delete(request),
      () => this.requests.delete(request),
    );
    return request;
  }

  private async checkForTypeOpen(type: CheckType): Promise<HealthResponse> {
    const { defaults, rollup } = this.config;
    const drainedResponse = (): HealthResponse => ({
      status: "fail",
      timestamp: new Date().toISOString(),
      checks: {},
    });
    if (type === "readiness" && this.draining) return drainedResponse();
    const checks = this.config.checks.filter((c) => c.type.includes(type));

    const defaultTimeout = defaults?.timeout;

    const checkResult = await runChecks(checks, this.scheduler, defaultTimeout);
    // A request that began before drain must not return a healthy result afterward.
    if (type === "readiness" && this.draining) return drainedResponse();
    const overallStatus = computeRollupStatus(checkResult, rollup);

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks: checkResult,
    };
  }

  private resolveHttpStatus(
    overallStatus: CheckStatus,
    checks: HealthkitConfig["checks"],
    results: HealthResponse["checks"],
  ): number {
    const { defaults } = this.config;

    for (const check of checks) {
      const result = results[check.name];
      if (result?.status === "fail" && check.onFail?.httpStatus !== undefined) {
        return check.onFail.httpStatus;
      }
    }

    if (overallStatus === "fail") {
      return defaults?.onFail?.httpStatus ?? DEFAULT_FAIL_STATUS;
    }

    if (overallStatus === "degraded") {
      for (const check of checks) {
        const result = results[check.name];
        if (result?.status === "degraded" && check.onDegraded?.httpStatus !== undefined) {
          return check.onDegraded.httpStatus;
        }
      }
      return defaults?.onDegraded?.httpStatus ?? DEFAULT_DEGRADED_STATUS;
    }

    return 200;
  }
}

export function createHealthKit(config: HealthkitConfig): HealthKit {
  return new HealthKit(config);
}
