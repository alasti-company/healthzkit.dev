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

export class HealthKit {
  private scheduler: Scheduler;
  private started = false;

  constructor(private config: HealthkitConfig) {
    this.scheduler = new Scheduler();
  }

  start(): void {
    if (this.started) return;
    this.scheduler.start(this.config.checks);
    this.started = true;
  }

  stop(): void {
    this.scheduler.stop();
    this.started = false;
  }

  async handleLiveness(): Promise<AgnosticResponse> {
    return this.runForType("liveness");
  }

  async handleReadiness(): Promise<AgnosticResponse> {
    return this.runForType("readiness");
  }

  async handleRequest(req: AgnosticRequest): Promise<AgnosticResponse | null> {
    const basePath = this.config.basePath ?? DEFAULT_BASE_PATH;
    const { path } = req;

    if (path === `${basePath}/live`) return this.handleLiveness();
    if (path === `${basePath}/ready`) return this.handleReadiness();

    return null;
  }

  private async runForType(type: CheckType): Promise<AgnosticResponse> {
    const checks = this.config.checks.filter((c) => c.type.includes(type));
    const { output, defaults, rollup } = this.config;

    const exposeError = output?.exposeError ?? true;
    const defaultTimeout = defaults?.timeout;

    const checkResult = await runChecks(checks, this.scheduler, defaultTimeout, exposeError);
    const overallStatus = computeRollupStatus(checkResult, rollup);

    const response: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks: checkResult,
    };

    const { body, contentType } = format(response, output?.format);
    const httpStatus = this.resolveHttpStatus(overallStatus, checks, checkResult);

    return {
      status: httpStatus,
      headers: { "Content-Type": contentType },
      body,
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
      return defaults?.onDegraded?.httpStatus ?? DEFAULT_DEGRADED_STATUS;
    }

    return 200;
  }
}

export function createHealthKit(config: HealthkitConfig): HealthKit {
  return new HealthKit(config);
}
