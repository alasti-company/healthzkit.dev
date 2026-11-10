import type { Queue } from "bullmq";
import { buildErrorResult, type HealthAdapter } from "@healthzkit/shared";

const BACKLOG_STATES = ["waiting", "paused", "prioritized", "delayed"] as const;

export type BullmqBacklogState = (typeof BACKLOG_STATES)[number];
/** Only the read operation is required; typed application Queues are accepted. */
export type BullmqQueue = Pick<Queue, "getJobCounts">;

export interface BullmqAdapterOptions {
  /** Application-owned BullMQ 5 Queue. The adapter never closes it. */
  queue: BullmqQueue;
  /** Per-state maximum counts. Only counts strictly above a limit yield degraded. */
  thresholds?: Partial<Record<BullmqBacklogState, number>>;
}

export function bullmqAdapter(options: BullmqAdapterOptions): HealthAdapter {
  const thresholds = { ...options.thresholds };
  for (const [state, limit] of Object.entries(thresholds)) {
    if (
      !BACKLOG_STATES.includes(state as BullmqBacklogState) ||
      !Number.isSafeInteger(limit) ||
      limit < 0
    ) {
      throw new TypeError(
        "bullmqAdapter: thresholds must be non-negative safe integers for waiting, paused, prioritized, or delayed",
      );
    }
  }

  return {
    async check(context) {
      try {
        context?.signal.throwIfAborted();
        const start = Date.now();
        // Fixed-size count query: no job payloads, enumeration, enqueueing, or consumption.
        const counts = await options.queue.getJobCounts(...BACKLOG_STATES);
        context?.signal.throwIfAborted();
        const backlog = {} as Record<BullmqBacklogState, number>;
        const exceeded: BullmqBacklogState[] = [];
        for (const state of BACKLOG_STATES) {
          const count = counts[state];
          if (!Number.isSafeInteger(count) || count < 0) {
            throw new Error(`bullmqAdapter: invalid ${state} count`);
          }
          backlog[state] = count;
          const limit = thresholds[state];
          if (limit !== undefined && count > limit) exceeded.push(state);
        }
        return {
          status: exceeded.length ? "degraded" : "ok",
          metadata: { counts: backlog, exceeded, latencyMs: Date.now() - start },
        };
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
