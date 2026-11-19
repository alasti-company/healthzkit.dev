import { CheckExecutor } from "./executor.ts";
import { DEFAULT_TIMEOUTMS, MAX_TIMER_MS } from "./timeout.ts";
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

interface ScheduledPending {
  operation: Promise<AdapterResult>;
  result: Promise<CachedResult>;
  generation: number;
}

/**
 * Uniform integer from 0 through `jitterMs`, inclusive.
 * A zero span does not draw, so a fixed interval stays deterministic.
 */
export function sampleSchedulingJitter(
  jitterMs: number,
  random: () => number = Math.random,
): number {
  if (jitterMs === 0) return 0;
  const unit = random();
  if (!(unit > 0)) return 0;
  const delay = Math.floor(unit * (jitterMs + 1));
  return delay > jitterMs ? jitterMs : delay;
}

export class Scheduler {
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private jitterTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private active = new Set<string>();
  /** Checks whose next adapter start is still the initial jitter delay. */
  private initialWait = new Set<string>();
  private cache = new Map<string, CachedResult>();
  private executor = new CheckExecutor();
  private pending = new Map<string, ScheduledPending>();
  private generation = 0;
  private observed = new WeakSet<Promise<AdapterResult>>();
  private statuses = new Map<string, CheckStatus>();

  constructor(private hooks: ObservabilityHooks = {}) {}

  start(checks: CheckConfig[], defaultTimeout: number = DEFAULT_TIMEOUTMS): void {
    for (const check of checks) {
      if (!check.schedule) continue;
      if (this.active.has(check.name)) continue;
      this.active.add(check.name);

      const timeoutMs = check.timeout ?? defaultTimeout;
      const jitterMs = check.schedule.jitterMs ?? 0;
      // A fixed interval stays on setInterval so omitted jitter matches the
      // historical grid, including skips while an adapter is still in flight.
      if (jitterMs === 0) {
        this.runAndCache(check, timeoutMs);
        const timer = setInterval(
          () => this.runAndCache(check, timeoutMs),
          check.schedule.intervalMs,
        );
        if (timer.unref) timer.unref();
        this.timers.set(check.name, timer);
        continue;
      }
      this.startJittered(check, timeoutMs, jitterMs, check.schedule.intervalMs);
    }
  }

  stopTimers(): void {
    this.active.clear();
    this.initialWait.clear();
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    for (const timer of this.jitterTimers.values()) clearTimeout(timer);
    this.jitterTimers.clear();
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
    return this.currentPending(name)?.result;
  }

  /**
   * Share an in-flight scheduled run from the current lifecycle. A run retained
   * across stop() belongs to the previous lifecycle and is not shared. If the
   * initial delay has not started the adapter, start it now so the caller waits
   * for the check deadline rather than the remaining jitter. A refresh delay is
   * left in place; only the initial wait is promoted.
   */
  prepareScheduled(check: CheckConfig, timeoutMs: number): Promise<CachedResult> | undefined {
    if (!this.active.has(check.name)) return undefined;
    const pending = this.currentPending(check.name);
    if (pending) return pending.result;
    if (!this.initialWait.has(check.name)) return undefined;
    this.initialWait.delete(check.name);
    this.clearJitter(check.name);
    const jitterMs = check.schedule?.jitterMs ?? 0;
    const intervalMs = check.schedule?.intervalMs ?? 0;
    this.runAndCache(check, timeoutMs);
    if (jitterMs > 0) this.armRefresh(check, timeoutMs, jitterMs, intervalMs);
    return this.currentPending(check.name)?.result;
  }

  private currentPending(name: string): ScheduledPending | undefined {
    if (!this.active.has(name)) return undefined;
    const pending = this.pending.get(name);
    if (!pending || pending.generation !== this.generation) return undefined;
    return pending;
  }

  private startJittered(
    check: CheckConfig,
    timeoutMs: number,
    jitterMs: number,
    intervalMs: number,
  ): void {
    const begin = () => {
      this.initialWait.delete(check.name);
      this.runAndCache(check, timeoutMs);
      this.armRefresh(check, timeoutMs, jitterMs, intervalMs);
    };
    const initial = sampleSchedulingJitter(jitterMs);
    if (initial === 0) {
      begin();
      return;
    }
    this.initialWait.add(check.name);
    this.armDelay(check.name, initial, begin);
  }

  private armRefresh(
    check: CheckConfig,
    timeoutMs: number,
    jitterMs: number,
    intervalMs: number,
  ): void {
    if (!this.active.has(check.name)) return;
    // The next attempt is armed even when this run is skipped, so a hung
    // adapter cannot freeze later refreshes. The extra delay is at most
    // jitterMs, which the stale-result limit includes.
    const delay = intervalMs + sampleSchedulingJitter(jitterMs);
    this.armDelay(check.name, delay, () => {
      this.runAndCache(check, timeoutMs);
      this.armRefresh(check, timeoutMs, jitterMs, intervalMs);
    });
  }

  private armDelay(name: string, delay: number, onFire: () => void): void {
    this.clearJitter(name);
    const step = Math.min(delay, MAX_TIMER_MS);
    const timer = setTimeout(() => {
      this.jitterTimers.delete(name);
      if (!this.active.has(name)) return;
      const remaining = delay - step;
      if (remaining > 0) {
        this.armDelay(name, remaining, onFire);
        return;
      }
      onFire();
    }, step);
    if (timer.unref) timer.unref();
    this.jitterTimers.set(name, timer);
  }

  private clearJitter(name: string): void {
    const timer = this.jitterTimers.get(name);
    if (timer !== undefined) clearTimeout(timer);
    this.jitterTimers.delete(name);
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
      generation: this.generation,
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
