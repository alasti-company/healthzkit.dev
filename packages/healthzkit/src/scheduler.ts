import { CheckExecutor } from "./executor.ts";
import { DEFAULT_TIMEOUTMS } from "./timeout.ts";
import type {
  AdapterResult,
  CheckConfig,
  CheckCompleteEvent,
  CheckStatus,
  ObservabilityHooks,
} from "./types.ts";

export interface CachedResult {
  result: AdapterResult;
  cachedAt: Date;
}

export class Scheduler {
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private cache = new Map<string, CachedResult>();
  private executor = new CheckExecutor();
  private pending = new Map<
    string,
    { operation: Promise<AdapterResult>; result: Promise<CachedResult> }
  >();
  private generation = 0;
  private observed = new WeakSet<Promise<AdapterResult>>();
  private statuses = new Map<string, CheckStatus>();

  constructor(private hooks: ObservabilityHooks = {}) {}

  start(checks: CheckConfig[], defaultTimeout: number = DEFAULT_TIMEOUTMS): void {
    for (const check of checks) {
      if (!check.schedule) continue;
      if (this.timers.has(check.name)) continue;

      this.runAndCache(check, check.timeout ?? defaultTimeout);

      const timer = setInterval(
        () => this.runAndCache(check, check.timeout ?? defaultTimeout),
        check.schedule.intervalMs,
      );

      if (timer.unref) timer.unref();

      this.timers.set(check.name, timer);
    }
  }

  stopTimers(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }

    this.timers.clear();
  }

  stop(): void {
    this.stopTimers();
    this.cache.clear();
    this.generation++;
    this.statuses.clear();
    // Retain stopped scheduled runs so a restart cannot adopt their old result.
    for (const [name, pending] of this.pending) {
      if (this.executor.get(name) !== pending.operation) this.pending.delete(name);
    }
  }

  getCache(name: string): CachedResult | undefined {
    return this.cache.get(name);
  }

  getPending(name: string): Promise<CachedResult> | undefined {
    return this.timers.has(name) ? this.pending.get(name)?.result : undefined;
  }

  runCheck(
    check: CheckConfig,
    timeoutMs: number,
    source: CheckCompleteEvent["source"] = "on-demand",
  ): Promise<AdapterResult> {
    const operation = this.executor.run(check, timeoutMs);
    if (!this.observed.has(operation)) {
      this.observed.add(operation);
      const start = performance.now();
      const generation = this.generation;
      const complete = (result: AdapterResult) => {
        // An operation from a stopped lifecycle must not update the new lifecycle.
        if (generation !== this.generation) return;
        const status =
          result.status === "fail" && check.onFail?.treatAs ? check.onFail.treatAs : result.status;
        const duration = performance.now() - start;
        const error = result.error instanceof Error ? result.error.message : result.error;
        const event: CheckCompleteEvent = {
          name: check.name,
          type: [...check.type],
          source,
          status,
          duration,
          timestamp: new Date().toISOString(),
          result: {
            status,
            latency: duration,
            ...(error && { error }),
            ...(result.metadata && { metadata: result.metadata }),
          },
        };
        const previousStatus = this.statuses.get(check.name);
        this.statuses.set(check.name, status);
        this.notify(this.hooks.onCheckComplete, event);
        if (previousStatus !== undefined && previousStatus !== status) {
          this.notify(this.hooks.onStatusChange, { ...event, previousStatus });
        }
      };
      void operation.then(complete, (error: unknown) =>
        complete({
          status: "fail",
          error: error instanceof Error ? error : String(error),
        }),
      );
    }
    return operation;
  }

  private notify<T extends CheckCompleteEvent>(
    hook: ((event: T) => unknown) | undefined,
    event: T,
  ): void {
    if (!hook) return;
    try {
      // Isolate callback mutations as well as exceptions from the execution/cache.
      let snapshot: T;
      try {
        snapshot = structuredClone(event);
      } catch {
        // Arbitrary adapter metadata must not prevent counting the execution.
        const { metadata: _metadata, ...result } = event.result;
        snapshot = structuredClone({ ...event, result });
      }
      void Promise.resolve(hook(snapshot)).catch(() => {});
    } catch {
      // Telemetry is best effort.
    }
  }

  async settle(): Promise<void> {
    await this.executor.settle();
  }

  private runAndCache(check: CheckConfig, timeoutMs: number): void {
    // Adopt an existing on-demand operation when scheduling first starts.
    const existing = this.executor.get(check.name);
    if (existing && this.pending.get(check.name)?.operation === existing) return;
    const operation = this.runCheck(check, timeoutMs, "scheduled");
    this.pending.set(check.name, {
      operation,
      result: this.executeAndCache(check, operation),
    });
  }

  private async executeAndCache(
    check: CheckConfig,
    operation: Promise<AdapterResult>,
  ): Promise<CachedResult> {
    const generation = this.generation;

    let result: AdapterResult;
    try {
      result = await operation;
    } catch (error) {
      result = {
        status: "fail",
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
    if (generation !== this.generation) {
      return {
        result: {
          status: "fail",
          error: new Error(`Check "${check.name}" scheduled run was stopped`),
        },
        cachedAt: new Date(),
      };
    }
    const cached = { result, cachedAt: new Date() };
    this.cache.set(check.name, cached);
    return cached;
  }
}
