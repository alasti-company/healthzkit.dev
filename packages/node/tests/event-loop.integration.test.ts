import { setTimeout } from "node:timers/promises";
import { performance } from "node:perf_hooks";
import { expect, it } from "vite-plus/test";
import { eventLoopAdapter } from "../src/event-loop.ts";

it("detects a real event-loop stall and recovers after a healthy window", async () => {
  const adapter = eventLoopAdapter({ maxDelayMs: 80, resolutionMs: 5, windowMs: 500 });
  async function waitForStatus(status: "ok" | "fail") {
    const deadline = performance.now() + 4_000;
    do {
      const result = await adapter.check();
      if (!result.metadata?.warmingUp && result.status === status) return result;
      await setTimeout(10);
    } while (performance.now() < deadline);
    throw new Error(`Event loop did not reach ${status} within four seconds`);
  }
  try {
    await waitForStatus("ok");
    // Let the histogram timer sample before deliberately blocking this test's loop.
    await setTimeout(20);
    const until = performance.now() + 180;
    while (performance.now() < until) {
      // Synchronous work simulates a real application stall.
    }
    const failed = await waitForStatus("fail");
    expect(failed.metadata?.delayMs).toBeGreaterThan(80);
    const recovered = await waitForStatus("ok");
    expect(recovered.metadata?.delayMs).toBeLessThanOrEqual(80);
  } finally {
    await adapter.dispose?.();
  }
}, 10_000);
