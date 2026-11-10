import { createHealthKit } from "healthzkit";
import { describe, expect, test, vi } from "vite-plus/test";
import { bullmqAdapter, type BullmqBacklogState } from "../src/index.ts";

function queue(counts = { waiting: 0, paused: 0, prioritized: 0, delayed: 0 }) {
  return {
    getJobCounts: vi.fn(async () => counts),
    close: vi.fn(),
    disconnect: vi.fn(),
    add: vi.fn(),
    getJobs: vi.fn(),
  };
}

describe("bullmqAdapter", () => {
  test("uses one fixed count query, accepts empty queues, and never creates jobs", async () => {
    const client = queue();
    const adapter = bullmqAdapter({ queue: client });
    expect((await adapter.check()).status).toBe("ok");
    expect((await adapter.check()).metadata).toMatchObject({
      counts: { waiting: 0, paused: 0, prioritized: 0, delayed: 0 },
      exceeded: [],
      latencyMs: expect.any(Number),
    });
    expect(client.getJobCounts).toHaveBeenCalledTimes(2);
    expect(client.getJobCounts).toHaveBeenCalledWith("waiting", "paused", "prioritized", "delayed");
    expect(client.add).not.toHaveBeenCalled();
    expect(client.getJobs).not.toHaveBeenCalled();
  });

  test.each<BullmqBacklogState>(["waiting", "paused", "prioritized", "delayed"])(
    "%s only degrades strictly above its explicit threshold",
    async (state) => {
      const counts = { waiting: 0, paused: 0, prioritized: 0, delayed: 0 };
      const client = queue(counts);
      const adapter = bullmqAdapter({ queue: client, thresholds: { [state]: 1 } });
      counts[state] = 1;
      expect((await adapter.check()).status).toBe("ok");
      counts[state] = 2;
      expect(await adapter.check()).toMatchObject({
        status: "degraded",
        metadata: { exceeded: [state] },
      });
    },
  );

  test("has no implicit thresholds, supports zero, and keeps states separate", async () => {
    const client = queue({ waiting: 0, paused: 1000, prioritized: 1000, delayed: 1000 });
    expect((await bullmqAdapter({ queue: client }).check()).status).toBe("ok");
    expect(
      (await bullmqAdapter({ queue: client, thresholds: { waiting: 0 } }).check()).status,
    ).toBe("ok");
    expect(
      await bullmqAdapter({ queue: client, thresholds: { paused: 0, delayed: 0 } }).check(),
    ).toMatchObject({
      status: "degraded",
      metadata: { exceeded: ["paused", "delayed"] },
    });
  });

  test.each([-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid threshold %s",
    (limit) => {
      expect(() => bullmqAdapter({ queue: queue(), thresholds: { waiting: limit } })).toThrow(
        TypeError,
      );
    },
  );

  test("rejects unknown threshold states and snapshots configuration", async () => {
    expect(() => bullmqAdapter({ queue: queue(), thresholds: { failed: 1 } as never })).toThrow(
      TypeError,
    );
    const thresholds = { waiting: 0 };
    const adapter = bullmqAdapter({
      queue: queue({ waiting: 1, paused: 0, prioritized: 0, delayed: 0 }),
      thresholds,
    });
    thresholds.waiting = 100;
    expect((await adapter.check()).status).toBe("degraded");
  });

  test("reports command rejection and permits recovery", async () => {
    const client = queue();
    const error = new Error("Redis unavailable");
    client.getJobCounts.mockRejectedValueOnce(error);
    const adapter = bullmqAdapter({ queue: client });
    expect(await adapter.check()).toEqual({ status: "fail", error });
    expect((await adapter.check()).status).toBe("ok");
  });

  test.each([undefined, -1, NaN, 0.5])("fails on invalid/missing counts (%s)", async (count) => {
    const client = {
      getJobCounts: async () => ({ waiting: count, paused: 0, prioritized: 0, delayed: 0 }),
    };
    expect((await bullmqAdapter({ queue: client as never }).check()).status).toBe("fail");
  });

  test("honors cooperative abort before and after the driver operation", async () => {
    const controller = new AbortController();
    const client = queue();
    const adapter = bullmqAdapter({ queue: client });
    controller.abort();
    expect((await adapter.check({ signal: controller.signal })).status).toBe("fail");
    expect(client.getJobCounts).not.toHaveBeenCalled();
    const during = new AbortController();
    client.getJobCounts.mockImplementationOnce(async () => {
      during.abort();
      return { waiting: 0, paused: 0, prioritized: 0, delayed: 0 };
    });
    expect((await adapter.check({ signal: during.signal })).status).toBe("fail");
  });

  test("kit shutdown preserves the application-owned Queue", async () => {
    const client = queue();
    const kit = createHealthKit({
      checks: [{ name: "queue", type: ["readiness"], adapter: bullmqAdapter({ queue: client }) }],
    });
    await kit.handleReadiness();
    await kit.close();
    expect(client.close).not.toHaveBeenCalled();
    expect(client.disconnect).not.toHaveBeenCalled();
    expect((await bullmqAdapter({ queue: client }).check()).status).toBe("ok");
  });
});
