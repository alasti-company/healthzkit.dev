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
  private generation = 0;

  start(checks: CheckConfig[], defaultTimeout: number = DEFAULT_TIMEOUTMS): void {
    for (const check of checks) {
      if (!check.schedule) continue;
      if (this.timers.has(check.name)) continue;

      void this.runAndCache(check, check.timeout ?? defaultTimeout);

      const timer = setInterval(
        () => void this.runAndCache(check, check.timeout ?? defaultTimeout),
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
  }

  getCache(name: string): CachedResult | undefined {
    return this.cache.get(name);
  }

  private async runAndCache(check: CheckConfig, timeoutMs: number): Promise<void> {
    if (this.inFlight.has(check.name)) return;

    const run = Symbol();
    const generation = this.generation;
    this.inFlight.set(check.name, run);
    const release = () => {
      if (this.inFlight.get(check.name) === run) this.inFlight.delete(check.name);
    };

    try {
      // Keep the check in flight until the adapter settles, even after a timeout.
      const pending = Promise.resolve()
        .then(() => check.adapter.check())
        .finally(release);
      const result = await withTimeout(pending, timeoutMs, check.name);
      if (generation === this.generation) {
        this.cache.set(check.name, { result, cachedAt: new Date() });
      }
    } catch (error) {
      if (generation === this.generation) {
        this.cache.set(check.name, {
          result: {
            status: "fail",
            error: error instanceof Error ? error : new Error(String(error)),
          },
          cachedAt: new Date(),
        });
      }
    }
  }
}
