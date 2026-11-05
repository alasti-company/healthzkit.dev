import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { createHealthKit } from "../src/index.ts";
import type {
  AdapterResult,
  CheckCompleteEvent,
  CheckStatus,
  HealthAdapter,
} from "../src/index.ts";

describe("structured probes and execution hooks", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test.each(["liveness", "readiness"] as const)(
    "%s shares HTTP rollup and results",
    async (type) => {
      const check = vi.fn<HealthAdapter["check"]>().mockResolvedValue({
        status: "fail",
        error: new Error("offline"),
        metadata: { region: "local" },
      });
      const kit = createHealthKit({
        checks: [
          {
            name: "db",
            type: [type],
            adapter: { check },
            onFail: { treatAs: "degraded" },
            onDegraded: { httpStatus: 429 },
          },
        ],
        rollup: { computeStatus: (results) => results.db.status },
      });
      const structured = await (type === "liveness" ? kit.checkLiveness() : kit.checkReadiness());
      const http = await (type === "liveness" ? kit.handleLiveness() : kit.handleReadiness());
      expect(JSON.parse(http.body)).toEqual(structured);
      expect(structured.checks.db).toMatchObject({ status: "degraded", error: "offline" });
      expect(http.status).toBe(429);
      expect(check).toHaveBeenCalledTimes(2);
    },
  );

  test.each(["json", "text"] as const)(
    "%s filtering leaves internal diagnostics intact",
    async (format) => {
      const onCheckComplete = vi.fn();
      const kit = createHealthKit({
        checks: [
          {
            name: "db",
            type: ["readiness"],
            adapter: {
              check: async () => ({
                status: "fail",
                error: "secret diagnostic",
                metadata: { detail: true },
              }),
            },
          },
        ],
        output: { format, exposeError: false },
        hooks: { onCheckComplete },
      });
      expect((await kit.checkReadiness()).checks.db.error).toBe("secret diagnostic");
      expect((await kit.handleReadiness()).body).not.toContain("secret diagnostic");
      expect(onCheckComplete.mock.calls[0][0].result).toMatchObject({
        error: "secret diagnostic",
        metadata: { detail: true },
      });
    },
  );

  test("concurrent structured and HTTP callers produce one completion with execution duration", async () => {
    let resolve!: (result: AdapterResult) => void;
    const check = vi.fn<HealthAdapter["check"]>(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const onCheckComplete = vi.fn();
    const kit = createHealthKit({
      checks: [{ name: "db", type: ["liveness", "readiness"], adapter: { check } }],
      hooks: { onCheckComplete },
    });
    const responses = Promise.all([
      kit.checkLiveness(),
      kit.checkReadiness(),
      kit.handleReadiness(),
    ]);
    await vi.advanceTimersByTimeAsync(20);
    resolve({ status: "ok" });
    await responses;
    expect(check).toHaveBeenCalledOnce();
    expect(onCheckComplete).toHaveBeenCalledExactlyOnceWith({
      name: "db",
      type: ["liveness", "readiness"],
      source: "on-demand",
      status: "ok",
      duration: 20,
      timestamp: new Date().toISOString(),
      result: { status: "ok", latency: 20 },
    });
  });

  test("scheduled completion emits without probes; pending and cached reads emit nothing extra", async () => {
    const check = vi.fn<HealthAdapter["check"]>(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { status: "ok" };
    });
    const onCheckComplete = vi.fn();
    const kit = createHealthKit({
      checks: [
        { name: "db", type: ["readiness"], adapter: { check }, schedule: { intervalMs: 100 } },
      ],
      hooks: { onCheckComplete },
    });
    try {
      kit.start();
      const pending = kit.checkReadiness();
      await vi.advanceTimersByTimeAsync(10);
      expect((await pending).checks.db.cachedAt).toBeDefined();
      const cached = await kit.checkReadiness();
      expect(cached.checks.db.latency).toBe(0);
      expect(JSON.parse((await kit.handleReadiness()).body)).toEqual(cached);
      expect(onCheckComplete).toHaveBeenCalledOnce();
      expect(onCheckComplete.mock.calls[0][0]).toMatchObject({ source: "scheduled", duration: 10 });
      await vi.advanceTimersByTimeAsync(100);
      expect(onCheckComplete).toHaveBeenCalledTimes(2);
    } finally {
      kit.stop();
    }
  });

  test("an adopted on-demand operation retains its source", async () => {
    const onCheckComplete = vi.fn();
    const kit = createHealthKit({
      checks: [
        {
          name: "db",
          type: ["readiness"],
          schedule: { intervalMs: 100 },
          adapter: { check: async () => ({ status: "ok" }) },
        },
      ],
      hooks: { onCheckComplete },
    });
    try {
      const pending = kit.checkReadiness();
      // Allow runChecks to reach the executor before adopting the run.
      await Promise.resolve();
      kit.start();
      await pending;
      await kit.checkReadiness();
      expect(onCheckComplete).toHaveBeenCalledOnce();
      expect(onCheckComplete.mock.calls[0][0].source).toBe("on-demand");
    } finally {
      kit.stop();
    }
  });

  test("timeout emits once even with repeated callers and late adapter settlement", async () => {
    let resolve!: (result: AdapterResult) => void;
    const onCheckComplete = vi.fn();
    const kit = createHealthKit({
      defaults: { timeout: 25 },
      checks: [
        {
          name: "db",
          type: ["readiness"],
          adapter: {
            check: () =>
              new Promise((done) => {
                resolve = done;
              }),
          },
        },
      ],
      hooks: { onCheckComplete },
    });
    const pending = kit.checkReadiness();
    await vi.advanceTimersByTimeAsync(25);
    expect((await pending).status).toBe("fail");
    await kit.checkReadiness();
    expect((await kit.handleReadiness()).status).toBe(503);
    expect(onCheckComplete.mock.calls[0][0]).toMatchObject({ duration: 25, status: "fail" });
    resolve({ status: "ok" });
    await vi.advanceTimersByTimeAsync(0);
    expect(onCheckComplete).toHaveBeenCalledOnce();
  });

  test("transitions use effective per-check status, reset on stop, and ignore hook failures", async () => {
    let status: CheckStatus = "ok";
    const onCheckComplete = vi.fn((event: CheckCompleteEvent) => {
      event.result.status = "fail";
      throw new Error("telemetry offline");
    });
    const onStatusChange = vi.fn(async () => {
      throw new Error("async telemetry offline");
    });
    const kit = createHealthKit({
      checks: [
        {
          name: "db",
          type: ["readiness"],
          adapter: { check: async () => ({ status }) },
          onFail: { treatAs: "degraded" },
        },
      ],
      hooks: { onCheckComplete, onStatusChange },
    });
    expect((await kit.checkReadiness()).status).toBe("ok");
    expect(onStatusChange).not.toHaveBeenCalled();
    status = "fail";
    expect((await kit.handleReadiness()).status).toBe(200);
    await kit.checkReadiness();
    expect(onStatusChange).toHaveBeenCalledOnce();
    expect(onStatusChange.mock.calls[0]).toMatchObject([
      { previousStatus: "ok", status: "degraded" },
    ]);
    kit.stop();
    status = "ok";
    expect((await kit.checkReadiness()).status).toBe("ok");
    expect(onStatusChange).toHaveBeenCalledOnce();
  });

  test("stopped scheduled executions do not emit into the next lifecycle", async () => {
    const onCheckComplete = vi.fn();
    const kit = createHealthKit({
      defaults: { timeout: 25 },
      checks: [
        {
          name: "db",
          type: ["readiness"],
          schedule: { intervalMs: 10 },
          adapter: { check: () => new Promise(() => {}) },
        },
      ],
      hooks: { onCheckComplete },
    });
    kit.start();
    kit.stop();
    await vi.advanceTimersByTimeAsync(25);
    expect(onCheckComplete).not.toHaveBeenCalled();
  });

  test("throwing and rejecting hooks cannot stop background refreshes", async () => {
    const check = vi
      .fn<HealthAdapter["check"]>()
      .mockResolvedValueOnce({ status: "ok" })
      .mockRejectedValueOnce(new Error("dependency down"))
      .mockResolvedValue({ status: "ok" });
    const onCheckComplete = vi.fn(() => {
      throw new Error("logger down");
    });
    const onStatusChange = vi.fn(async () => {
      throw new Error("exporter down");
    });
    const kit = createHealthKit({
      checks: [
        { name: "db", type: ["readiness"], schedule: { intervalMs: 100 }, adapter: { check } },
      ],
      hooks: { onCheckComplete, onStatusChange },
    });
    try {
      kit.start();
      await vi.advanceTimersByTimeAsync(0);
      expect((await kit.checkReadiness()).status).toBe("ok");
      await vi.advanceTimersByTimeAsync(100);
      expect((await kit.checkReadiness()).checks.db.error).toBe("dependency down");
      await vi.advanceTimersByTimeAsync(100);
      expect((await kit.checkReadiness()).status).toBe("ok");
      expect(check).toHaveBeenCalledTimes(3);
      expect(onCheckComplete).toHaveBeenCalledTimes(3);
      expect(onStatusChange).toHaveBeenCalledTimes(2);
    } finally {
      kit.stop();
    }
  });

  test("stale cache evaluation does not create execution or transition events", async () => {
    const onCheckComplete = vi.fn();
    const onStatusChange = vi.fn();
    const kit = createHealthKit({
      defaults: { timeout: 25 },
      checks: [
        {
          name: "db",
          type: ["readiness"],
          schedule: { intervalMs: 100 },
          adapter: { check: async () => ({ status: "ok" }) },
        },
      ],
      hooks: { onCheckComplete, onStatusChange },
    });
    try {
      kit.start();
      await vi.advanceTimersByTimeAsync(0);
      // Simulate a delayed event loop: cache ages without running refresh timers.
      vi.setSystemTime(Date.now() + 125);
      expect((await kit.checkReadiness()).checks.db.error).toContain("stale");
      expect(onCheckComplete).toHaveBeenCalledOnce();
      expect(onStatusChange).not.toHaveBeenCalled();
    } finally {
      kit.stop();
    }
  });

  test("non-cloneable metadata cannot drop completion events or expose shared mutable data", async () => {
    const onCheckComplete = vi.fn();
    const metadata = { diagnostic: () => "detail" };
    const kit = createHealthKit({
      checks: [
        {
          name: "db",
          type: ["readiness"],
          adapter: {
            check: async () => ({ status: "ok", metadata }),
          },
        },
      ],
      hooks: { onCheckComplete },
    });
    expect((await kit.checkReadiness()).checks.db.metadata).toBe(metadata);
    expect(onCheckComplete).toHaveBeenCalledOnce();
    expect(onCheckComplete.mock.calls[0][0].result.metadata).toBeUndefined();
  });
});
