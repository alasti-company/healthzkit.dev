import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { positive, withDisposal, buildErrorResult } from "./shared.ts";
import type { HealthAdapter, AdapterResult } from "./shared.ts";

export interface EventLoopAdapterOptions {
  /** Inclusive maximum sampled timer delay, in milliseconds (includes resolution baseline). */
  maxDelayMs: number;
  /** Histogram sampling resolution in integer milliseconds. Default: 10. */
  resolutionMs?: number;
  /** Fixed background window in integer milliseconds. Default: 1000; at least twice resolution. */
  windowMs?: number;
}

export function eventLoopAdapter(options: EventLoopAdapterOptions): HealthAdapter {
  const { maxDelayMs, resolutionMs = 10, windowMs = 1000 } = options;
  positive(maxDelayMs, "maxDelayMs");
  positive(resolutionMs, "resolutionMs", true);
  positive(windowMs, "windowMs", true);
  if (windowMs > 2_147_483_647 || resolutionMs > 2_147_483_647 || windowMs < resolutionMs * 2) {
    throw new RangeError(
      "windowMs must be at least twice resolutionMs and both must fit Node timers",
    );
  }
  const histogram = monitorEventLoopDelay({ resolution: resolutionMs });
  let started = performance.now();
  let snapshot: AdapterResult = {
    status: "fail",
    metadata: { warmingUp: true, maxDelayMs, resolutionMs, windowMs },
  };
  histogram.enable();
  const timer = setInterval(() => {
    const now = performance.now();
    const sampleCount = histogram.count;
    const delayMs = sampleCount > 0 ? histogram.max / 1e6 : undefined;
    snapshot = {
      status: delayMs !== undefined && delayMs <= maxDelayMs ? "ok" : "fail",
      metadata: {
        warmingUp: false,
        sampleCount,
        ...(delayMs === undefined ? {} : { delayMs }),
        maxDelayMs,
        resolutionMs,
        windowMs,
        observedWindowMs: now - started,
      },
    };
    histogram.reset();
    started = now;
  }, windowMs);
  timer.unref();
  return withDisposal(
    {
      async check(context) {
        if (context?.signal.aborted) return buildErrorResult(context.signal.reason);
        // Return a copy so direct callers cannot mutate the cached window.
        return { ...snapshot, metadata: { ...snapshot.metadata } };
      },
    },
    () => {
      clearInterval(timer);
      histogram.disable();
    },
  );
}
