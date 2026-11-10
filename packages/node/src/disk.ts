import { statfs } from "node:fs/promises";
import { positive, buildErrorResult } from "./shared.ts";
import type { HealthAdapter } from "./shared.ts";

export interface DiskAdapterOptions {
  /** Existing path on the filesystem to measure. Never included in metadata/errors. */
  path: string;
  /** Inclusive minimum bytes available to unprivileged users (safe integer). */
  minAvailableBytes?: number;
  /** Inclusive minimum available percentage of total blocks, from >0 through 100. */
  minAvailablePercent?: number;
}

export function diskAdapter(options: DiskAdapterOptions): HealthAdapter {
  const { path, minAvailableBytes, minAvailablePercent } = options;
  if (typeof path !== "string" || !path.trim() || path.includes("\0")) {
    throw new TypeError("path must be a nonempty filesystem path");
  }
  if (minAvailableBytes === undefined && minAvailablePercent === undefined) {
    throw new TypeError("Specify minAvailableBytes or minAvailablePercent");
  }
  if (minAvailableBytes !== undefined) positive(minAvailableBytes, "minAvailableBytes", true);
  if (minAvailablePercent !== undefined) {
    positive(minAvailablePercent, "minAvailablePercent");
    if (minAvailablePercent > 100) throw new RangeError("minAvailablePercent must be <= 100");
  }
  return {
    async check(context) {
      if (context?.signal.aborted) return buildErrorResult(context.signal.reason);
      try {
        const stats = await statfs(path, { bigint: true });
        if (context?.signal.aborted) return buildErrorResult(context.signal.reason);
        if (
          stats.blocks <= 0n ||
          stats.bsize <= 0n ||
          stats.bavail < 0n ||
          stats.bavail > stats.blocks
        ) {
          return buildErrorResult(new Error("Filesystem capacity is unavailable or invalid"));
        }
        const availableBytes = stats.bavail * stats.bsize;
        const totalBytes = stats.blocks * stats.bsize;
        const availablePercent = (Number(stats.bavail) * 100) / Number(stats.blocks);
        return {
          status:
            (minAvailableBytes === undefined || availableBytes >= BigInt(minAvailableBytes)) &&
            (minAvailablePercent === undefined || availablePercent >= minAvailablePercent)
              ? "ok"
              : "fail",
          metadata: {
            // Decimal strings preserve exact byte counts even on very large filesystems.
            availableBytes: availableBytes.toString(),
            totalBytes: totalBytes.toString(),
            availablePercent,
            ...(minAvailableBytes === undefined ? {} : { minAvailableBytes }),
            ...(minAvailablePercent === undefined ? {} : { minAvailablePercent }),
          },
        };
      } catch {
        return buildErrorResult(new Error("Unable to read filesystem capacity"));
      }
    },
  };
}
