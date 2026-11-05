import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { createHealthKit } from "../src/healthkit.ts";
import type { AdapterResult, CheckContext, HealthAdapter } from "../src/types.ts";

describe("on-demand in-flight work", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function kitFor(adapter: HealthAdapter) {
    return createHealthKit({
      defaults: { timeout: 25 },
      checks: [{ name: "db", type: ["readiness", "liveness"], adapter }],
    });
  }

  test("bounds repeated and concurrent requests while a timed-out operation stays pending", async () => {
    let signal!: AbortSignal;
    const check = vi.fn((context?: CheckContext) => {
      signal = context!.signal;
      return new Promise<AdapterResult>(() => {});
    });
    const kit = kitFor({ check });
    const first = kit.handleReadiness();
    await vi.advanceTimersByTimeAsync(10);
    const second = kit.handleLiveness();
    await vi.advanceTimersByTimeAsync(14);
    expect(signal.aborted).toBe(false);
    expect(check).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    for (const response of await Promise.all([first, second])) {
      expect(response.status).toBe(503);
      expect(JSON.parse(response.body).checks.db.error).toBe('Check "db" timed out after 25ms');
    }
    expect(signal.aborted).toBe(true);
    for (let i = 0; i < 3; i++) {
      expect((await kit.handleReadiness()).status).toBe(503);
    }
    kit.stop();
    expect((await kit.handleReadiness()).status).toBe(503);
    expect(check).toHaveBeenCalledOnce();
  });

  test("concurrent requests share a successful operation and later requests run again", async () => {
    let resolve!: (result: AdapterResult) => void;
    let signal!: AbortSignal;
    const check = vi.fn((context?: CheckContext) => {
      signal = context!.signal;
      return new Promise<AdapterResult>((done) => {
        resolve = done;
      });
    });
    const kit = kitFor({ check });
    const responses = Promise.all([kit.handleReadiness(), kit.handleLiveness()]);
    await vi.advanceTimersByTimeAsync(0);
    resolve({ status: "ok", metadata: { shared: true } });
    for (const response of await responses) {
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body).checks.db.metadata).toEqual({ shared: true });
    }
    await vi.advanceTimersByTimeAsync(25);
    expect(signal.aborted).toBe(false);
    const next = kit.handleReadiness();
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(2);
    resolve({ status: "ok" });
    expect((await next).status).toBe(200);
  });

  test.each(["resolve", "reject"])(
    "recovers after late %s without reusing a late result",
    async (settlement) => {
      let resolve!: (result: AdapterResult) => void;
      let reject!: (error: Error) => void;
      const check = vi
        .fn<HealthAdapter["check"]>()
        .mockImplementationOnce(
          () =>
            new Promise((done, fail) => {
              resolve = done;
              reject = fail;
            }),
        )
        .mockResolvedValue({ status: "ok", metadata: { fresh: true } });
      const kit = kitFor({ check });
      const pending = kit.handleReadiness();
      await vi.advanceTimersByTimeAsync(25);
      expect((await pending).status).toBe(503);
      if (settlement === "resolve") resolve({ status: "ok", metadata: { late: true } });
      else reject(new Error("late rejection"));
      await vi.advanceTimersByTimeAsync(0);
      const response = await kit.handleReadiness();
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body).checks.db.metadata).toEqual({ fresh: true });
      expect(check).toHaveBeenCalledTimes(2);
    },
  );

  test("abort-aware adapters release their operation after the deadline", async () => {
    const check = vi
      .fn<HealthAdapter["check"]>()
      .mockImplementationOnce(
        (context) =>
          new Promise((_resolve, reject) => {
            context!.signal.addEventListener("abort", () => reject(context!.signal.reason), {
              once: true,
            });
          }),
      )
      .mockResolvedValue({ status: "ok" });
    const kit = kitFor({ check });
    const response = kit.handleReadiness();
    await vi.advanceTimersByTimeAsync(25);
    expect((await response).status).toBe(503);
    expect((await kit.handleReadiness()).status).toBe(200);
  });

  test("synchronous errors release the operation", async () => {
    const check = vi
      .fn<HealthAdapter["check"]>()
      .mockImplementationOnce(() => {
        throw new Error("sync failure");
      })
      .mockResolvedValue({ status: "ok" });
    const kit = kitFor({ check });
    expect((await kit.handleReadiness()).status).toBe(503);
    expect((await kit.handleReadiness()).status).toBe(200);
  });

  test("kits and differently named checks using the same adapter have independent operations", async () => {
    const check = vi.fn<HealthAdapter["check"]>(() => new Promise(() => {}));
    const first = createHealthKit({
      defaults: { timeout: 25 },
      checks: ["one", "two"].map((name) => ({ name, type: ["readiness"], adapter: { check } })),
    });
    const second = kitFor({ check });
    const responses = Promise.all([first.handleReadiness(), second.handleReadiness()]);
    await vi.advanceTimersByTimeAsync(25);
    expect((await responses).map((response) => response.status)).toEqual([503, 503]);
    expect(check).toHaveBeenCalledTimes(3);
  });

  test("starting and stopping scheduling cannot duplicate an on-demand operation", async () => {
    const check = vi.fn<HealthAdapter["check"]>(() => new Promise(() => {}));
    const kit = createHealthKit({
      checks: [
        {
          name: "db",
          type: ["readiness"],
          timeout: 25,
          schedule: { intervalMs: 10 },
          adapter: { check },
        },
      ],
    });
    const response = kit.handleReadiness();
    await vi.advanceTimersByTimeAsync(0);
    kit.start();
    await vi.advanceTimersByTimeAsync(25);
    expect((await response).status).toBe(503);
    kit.stop();
    kit.start();
    await vi.advanceTimersByTimeAsync(100);
    expect((await kit.handleReadiness()).status).toBe(503);
    expect(check).toHaveBeenCalledOnce();
    kit.stop();
  });
});
