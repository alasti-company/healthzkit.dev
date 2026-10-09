import { DEFAULT_TIMEOUTMS, withTimeout } from "./timeout.ts";
import type { AdapterResult, CheckConfig } from "./types.ts";

export interface CachedResult {
  result: AdapterResult;
  cachedAt: Date;
}

export class Scheduler {
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private cache = new Map<string, CachedResult>();
  private inFlight = new Map<string, symbol>();
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
    for (const name of this.pending.keys()) {
      if (!this.inFlight.has(name)) this.pending.delete(name);
    }
  }

  getCache(name: string): CachedResult | undefined {
    return this.cache.get(name);
  }

  getPending(name: string): Promise<CachedResult> | undefined {
    return this.timers.has(name) ? this.pending.get(name) : undefined;
  }

  private runAndCache(check: CheckConfig, timeoutMs: number): void {
    if (this.inFlight.has(check.name)) return;
    this.pending.set(check.name, this.executeAndCache(check, timeoutMs));
  }

  private async executeAndCache(check: CheckConfig, timeoutMs: number): Promise<CachedResult> {
    const run = Symbol();
    const generation = this.generation;
    this.inFlight.set(check.name, run);
    const release = () => {
      if (this.inFlight.get(check.name) === run) {
        this.inFlight.delete(check.name);
        if (!this.timers.has(check.name)) this.pending.delete(check.name);
      }
    };

    let result: AdapterResult;
    try {
      // Keep the check in flight until the adapter settles, even after a timeout.
      const pending = Promise.resolve()
        .then(() => check.adapter.check())
        .finally(release);
      result = await withTimeout(pending, timeoutMs, check.name);
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
