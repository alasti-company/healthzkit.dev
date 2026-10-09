import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { createHealthKit } from "../src/healthkit.ts";
import type { AdapterResult } from "../src/types.ts";
import { Scheduler } from "../src/scheduler.ts";
import type { CheckConfig } from "../src/types.ts";

describe("src/scheduler.ts", () => {
  test("ignores checks without schedule", () => {
    const s = new Scheduler();
    s.start([
      { name: "n", type: ["liveness"], adapter: { check: async () => ({ status: "ok" }) } },
    ]);
    expect(s.getCache("n")).toBeUndefined();
    s.stop();
  });

  test("populates cache after initial runAndCache", async () => {
    const s = new Scheduler();
    s.start([
      {
        name: "a",
        type: ["liveness"],
        adapter: { check: async () => ({ status: "ok", metadata: { v: 2 } }) },
        schedule: { intervalMs: 60_000 },
      },
    ]);
    await vi.waitFor(() => {
      expect(s.getCache("a")?.result.status).toBe("ok");
    });
    expect(s.getCache("a")?.result.metadata).toEqual({ v: 2 });
    s.stop();
  });

  test("caches fail when adapter throws", async () => {
    const s = new Scheduler();
    s.start([
      {
        name: "b",
        type: ["liveness"],
        adapter: {
          check: async () => {
            throw new Error("bad");
          },
        },
        schedule: { intervalMs: 60_000 },
      },
    ]);
    await vi.waitFor(() => {
      expect(s.getCache("b")?.result.status).toBe("fail");
    });
    const err = s.getCache("b")?.result.error;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("bad");
    s.stop();
  });

  test("stop clears timers and cache", async () => {
    const s = new Scheduler();
    s.start([
      {
        name: "c",
        type: ["liveness"],
        adapter: { check: async () => ({ status: "ok" }) },
        schedule: { intervalMs: 60_000 },
      },
    ]);
    await vi.waitFor(() => {
      expect(s.getCache("c")).toBeDefined();
    });
    s.stop();
    expect(s.getCache("c")).toBeUndefined();
  });

  test("does not register duplicate timer for same check name", async () => {
    const check = vi.fn(async () => ({ status: "ok" as const }));
    const s = new Scheduler();
    const cfg: CheckConfig = {
      name: "d",
      type: ["liveness"],
      adapter: { check },
      schedule: { intervalMs: 60_000 },
    };
    s.start([cfg, cfg]);
    await vi.waitFor(() => {
      expect(check).toHaveBeenCalled();
    });
    expect(check.mock.calls.length).toBe(1);
    s.stop();
  });
});

describe("scheduled timeouts", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("hung refresh fails readiness without accumulating checks and recovers after settling", async () => {
    let resolveRefresh!: (result: AdapterResult) => void;
    const check = vi
      .fn<() => Promise<AdapterResult>>()
      .mockResolvedValueOnce({ status: "ok" })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve;
          }),
      )
      .mockResolvedValue({ status: "ok" });
    const kit = createHealthKit({
      defaults: { timeout: 25 },
      checks: [
        { name: "db", type: ["readiness"], adapter: { check }, schedule: { intervalMs: 10 } },
      ],
    });
    kit.start();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect((await kit.handleReadiness()).status).toBe(200);
      await vi.advanceTimersByTimeAsync(34);
      expect(check).toHaveBeenCalledTimes(2);
      expect((await kit.handleReadiness()).status).toBe(200);
      await vi.advanceTimersByTimeAsync(1);
      const failed = await kit.handleReadiness();
      expect(failed.status).toBe(503);
      expect(JSON.parse(failed.body).checks.db.error).toContain("timed out after 25ms");
      await vi.advanceTimersByTimeAsync(100);
      expect(check).toHaveBeenCalledTimes(2);
      expect((await kit.handleReadiness()).status).toBe(503);

      resolveRefresh({ status: "ok" });
      await vi.advanceTimersByTimeAsync(0);
      expect((await kit.handleReadiness()).status).toBe(503);
      await vi.advanceTimersByTimeAsync(5);
      expect(check).toHaveBeenCalledTimes(3);
      expect((await kit.handleReadiness()).status).toBe(200);
    } finally {
      kit.stop();
    }
  });

  test("check timeout overrides the scheduler default", async () => {
    const s = new Scheduler();
    s.start(
      [
        {
          name: "slow",
          type: ["readiness"],
          adapter: { check: () => new Promise(() => {}) },
          timeout: 20,
          schedule: { intervalMs: 10 },
        },
      ],
      100,
    );
    try {
      await vi.advanceTimersByTimeAsync(19);
      expect(s.getCache("slow")).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(s.getCache("slow")?.result.status).toBe("fail");
      expect(s.getCache("slow")?.result.error).toEqual(
        new Error('Check "slow" timed out after 20ms'),
      );
    } finally {
      s.stop();
    }
  });

  test("stop prevents a pending run from repopulating the cache after restart", async () => {
    let resolveCheck!: (result: AdapterResult) => void;
    const check = vi.fn(
      () =>
        new Promise<AdapterResult>((resolve) => {
          resolveCheck = resolve;
        }),
    );
    const cfg: CheckConfig = {
      name: "db",
      type: ["readiness"],
      adapter: { check },
      schedule: { intervalMs: 100 },
    };
    const s = new Scheduler();
    s.start([cfg]);
    await vi.advanceTimersByTimeAsync(0);
    s.stop();
    s.start([cfg]);
    try {
      resolveCheck({ status: "ok" });
      await vi.advanceTimersByTimeAsync(0);
      expect(s.getCache("db")).toBeUndefined();
      expect(check).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(100);
      expect(check).toHaveBeenCalledTimes(2);
    } finally {
      s.stop();
      resolveCheck({ status: "ok" });
      await vi.advanceTimersByTimeAsync(0);
      expect(s.getCache("db")).toBeUndefined();
    }
  });

  test("synchronous throws release the slot for subsequent checks", async () => {
    const check = vi
      .fn<() => Promise<AdapterResult>>()
      .mockImplementationOnce(() => {
        throw new Error("sync failure");
      })
      .mockResolvedValue({ status: "ok" });
    const s = new Scheduler();
    s.start([
      { name: "db", type: ["readiness"], adapter: { check }, schedule: { intervalMs: 10 } },
    ]);
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(s.getCache("db")?.result.status).toBe("fail");
      await vi.advanceTimersByTimeAsync(10);
      expect(s.getCache("db")?.result.status).toBe("ok");
    } finally {
      s.stop();
    }
  });
});
