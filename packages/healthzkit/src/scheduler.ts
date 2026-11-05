import { CheckExecutor } from "./executor.ts";
import { DEFAULT_TIMEOUTMS } from "./timeout.ts";
import type { AdapterResult, CheckConfig } from "./types.ts";

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

  stop(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }

    this.timers.clear();
    this.cache.clear();
    this.generation++;
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

  runCheck(check: CheckConfig, timeoutMs: number): Promise<AdapterResult> {
    return this.executor.run(check, timeoutMs);
  }

  private runAndCache(check: CheckConfig, timeoutMs: number): void {
    // Adopt an existing on-demand operation when scheduling first starts.
    const existing = this.executor.get(check.name);
    if (existing && this.pending.get(check.name)?.operation === existing) return;
    const operation = this.runCheck(check, timeoutMs);
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
