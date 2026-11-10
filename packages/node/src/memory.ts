import { memoryUsage } from "node:process";
import { positive, buildErrorResult } from "./shared.ts";
import type { HealthAdapter } from "./shared.ts";

export interface MemoryAdapterOptions {
  /** Process RSS (default) or current isolate's V8 heap usage. Both are bytes. */
  metric?: "rss" | "heapUsed";
  /** Inclusive upper bound in bytes. No automatic host/container limit detection. */
  maxBytes: number;
}

export function memoryAdapter(options: MemoryAdapterOptions): HealthAdapter {
  const { maxBytes, metric = "rss" } = options;
  positive(maxBytes, "maxBytes", true);
  if (metric !== "rss" && metric !== "heapUsed") throw new TypeError("Invalid memory metric");
  return {
    async check(context) {
      if (context?.signal.aborted) return buildErrorResult(context.signal.reason);
      try {
        const usedBytes = metric === "rss" ? memoryUsage.rss() : memoryUsage().heapUsed;
        return {
          status: usedBytes <= maxBytes ? "ok" : "fail",
          metadata: { metric, usedBytes, maxBytes },
        };
      } catch {
        return buildErrorResult(new Error("Unable to read process memory usage"));
      }
    },
  };
}
