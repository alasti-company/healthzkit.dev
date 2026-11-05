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
  private pending = new Map<string, Promise<CachedResult>>();
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
    this.pending.clear();
  }

  getCache(name: string): CachedResult | undefined {
    return this.cache.get(name);
  }

  getPending(name: string): Promise<CachedResult> | undefined {
    return this.timers.has(name) ? this.pending.get(name) : undefined;
  }

  runCheck(check: CheckConfig, timeoutMs: number): Promise<AdapterResult> {
    return this.executor.run(check, timeoutMs);
  }

  private runAndCache(check: CheckConfig, timeoutMs: number): void {
    if (this.executor.has(check.name)) return;
    this.pending.set(check.name, this.executeAndCache(check, timeoutMs));
  }

  private async executeAndCache(check: CheckConfig, timeoutMs: number): Promise<CachedResult> {
    const generation = this.generation;

    let result: AdapterResult;
    try {
      result = await this.runCheck(check, timeoutMs);
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
