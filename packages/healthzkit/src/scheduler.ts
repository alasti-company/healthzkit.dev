import type { AdapterResult, CheckConfig } from "./types.ts";

export interface CachedResult {
  result: AdapterResult;
  cachedAt: Date;
}

export class Scheduler {
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private cache = new Map<string, CachedResult>();

  start(checks: CheckConfig[]): void {
    for (const check of checks) {
      if (!check.schedule) continue;
      if (this.timers.has(check.name)) continue;

      void this.runAndCache(check);

      const timer = setInterval(() => this.runAndCache(check), check.schedule.intervalMs);

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
  }

  getCache(name: string): CachedResult | undefined {
    return this.cache.get(name);
  }

  private async runAndCache(check: CheckConfig): Promise<void> {
    try {
      const result = await check.adapter.check();
      this.cache.set(check.name, { result, cachedAt: new Date() });
    } catch (error) {
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
