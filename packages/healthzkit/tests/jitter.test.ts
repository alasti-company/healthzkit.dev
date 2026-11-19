import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { createHealthKit } from "../src/healthkit.ts";
import { Scheduler, sampleSchedulingJitter } from "../src/scheduler.ts";
import { MAX_TIMER_MS } from "../src/timeout.ts";
import type { AdapterResult, CheckConfig, CheckContext } from "../src/types.ts";

/** Maps to the inclusive upper bound of sampleSchedulingJitter. */
const LATEST = 1 - Number.EPSILON;

describe("sampleSchedulingJitter", () => {
  test("does not draw when the span is zero", () => {
    expect(
      sampleSchedulingJitter(0, () => {
        throw new Error("drew");
      }),
    ).toBe(0);
  });

  test.each([
    [1, 0, 0],
    [1, LATEST, 1],
    [40, 0, 0],
    [40, LATEST, 40],
    [MAX_TIMER_MS, 0, 0],
    [MAX_TIMER_MS, LATEST, MAX_TIMER_MS],
    [4, 1, 4],
    [4, -0.2, 0],
    [4, Number.NaN, 0],
  ] as const)("maps jitter %s and sample %s to %s", (jitterMs, sample, expected) => {
    expect(sampleSchedulingJitter(jitterMs, () => sample)).toBe(expected);
  });
});

describe("schedule jitter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("omitted jitter starts immediately and repeats on the interval without drawing", async () => {
    const random = vi.spyOn(Math, "random");
    const interval = vi.spyOn(globalThis, "setInterval");
    const check = vi.fn(async () => ({ status: "ok" as const }));
    const scheduler = new Scheduler();
    scheduler.start([scheduled(check, { intervalMs: 100 })]);
    expect(random).not.toHaveBeenCalled();
    expect(interval).toHaveBeenCalledWith(expect.any(Function), 100);
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(99);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  test("explicit zero jitter matches a fixed interval", async () => {
    const random = vi.spyOn(Math, "random");
    const check = vi.fn(async () => ({ status: "ok" as const }));
    const scheduler = new Scheduler();
    scheduler.start([scheduled(check, { intervalMs: 100, jitterMs: 0 })]);
    expect(random).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(check).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  test("latest draws wait the full jitter, then interval plus jitter, and draw again", async () => {
    const random = vi.spyOn(Math, "random");
    random.mockReturnValueOnce(0).mockReturnValueOnce(LATEST).mockReturnValueOnce(0);
    const check = vi.fn(async () => ({ status: "ok" as const }));
    const scheduler = new Scheduler();
    scheduler.start([scheduled(check, { intervalMs: 100, jitterMs: 40 })]);
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(check).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(139);
      expect(check).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(check).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(99);
      expect(check).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(check).toHaveBeenCalledTimes(3);
    } finally {
      scheduler.stop();
    }
  });

  test("a maximum initial delay does not run early and the next gap is interval plus jitter", async () => {
    vi.spyOn(Math, "random").mockReturnValue(LATEST);
    const check = vi.fn(async () => ({ status: "ok" as const }));
    const scheduler = new Scheduler();
    scheduler.start([scheduled(check, { intervalMs: 100, jitterMs: 40 })]);
    try {
      await vi.advanceTimersByTimeAsync(39);
      expect(check).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(check).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(139);
      expect(check).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(check).toHaveBeenCalledTimes(2);
    } finally {
      scheduler.stop();
    }
  });

  test("checks draw independent delays", async () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(LATEST);
    const first = vi.fn(async () => ({ status: "ok" as const }));
    const second = vi.fn(async () => ({ status: "ok" as const }));
    const scheduler = new Scheduler();
    scheduler.start([
      scheduled(first, { intervalMs: 100, jitterMs: 40 }, "a"),
      scheduled(second, { intervalMs: 100, jitterMs: 40 }, "b"),
    ]);
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(39);
      expect(second).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(second).toHaveBeenCalledTimes(1);
    } finally {
      scheduler.stop();
    }
  });

  test("stop cancels a delay that has not started, and start draws a new one", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(LATEST);
    const check = vi.fn(async () => ({ status: "ok" as const }));
    const scheduler = new Scheduler();
    const config = scheduled(check, { intervalMs: 100, jitterMs: 50 });
    scheduler.start([config]);
    await vi.advanceTimersByTimeAsync(49);
    expect(check).not.toHaveBeenCalled();
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(check).not.toHaveBeenCalled();

    random.mockReturnValue(0);
    scheduler.start([config]);
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(check).toHaveBeenCalledTimes(1);
    } finally {
      scheduler.stop();
    }
  });

  test("a stopped run cannot fill the cache of a later jittered start", async () => {
    let resolveCheck: (result: AdapterResult) => void = () => {};
    const check = vi.fn(
      () =>
        new Promise<AdapterResult>((resolve) => {
          resolveCheck = resolve;
        }),
    );
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const scheduler = new Scheduler();
    const config = scheduled(check, { intervalMs: 100, jitterMs: 40 });
    scheduler.start([config]);
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(1);
    scheduler.stop();

    random.mockReturnValue(LATEST);
    scheduler.start([config]);
    try {
      resolveCheck({ status: "ok" });
      await vi.advanceTimersByTimeAsync(0);
      expect(scheduler.getCache("db")).toBeUndefined();
      await vi.advanceTimersByTimeAsync(39);
      expect(check).toHaveBeenCalledTimes(1);
      expect(scheduler.getCache("db")).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(check).toHaveBeenCalledTimes(2);
      resolveCheck({ status: "ok" });
      await vi.advanceTimersByTimeAsync(0);
      expect(scheduler.getCache("db")?.result.status).toBe("ok");
    } finally {
      scheduler.stop();
    }
  });

  test("a health request after restart shares the new run, not the stopped one", async () => {
    let resolveCheck: (result: AdapterResult) => void = () => {};
    const check = vi.fn(
      () =>
        new Promise<AdapterResult>((resolve) => {
          resolveCheck = resolve;
        }),
    );
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const kit = createHealthKit({
      checks: [scheduled(check, { intervalMs: 100, jitterMs: 40 }, "db", 25)],
    });
    kit.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(1);
    kit.stop();
    resolveCheck({ status: "ok" });
    await vi.advanceTimersByTimeAsync(0);

    random.mockReturnValue(LATEST);
    kit.start();
    try {
      const pending = kit.handleReadiness();
      await vi.advanceTimersByTimeAsync(0);
      expect(check).toHaveBeenCalledTimes(2);
      resolveCheck({ status: "ok" });
      const response = await pending;
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body).checks.db).toMatchObject({
        status: "ok",
        latency: 0,
        cachedAt: expect.any(String),
      });
      expect(JSON.parse(response.body).checks.db.error).toBeUndefined();
    } finally {
      kit.stop();
    }
  });

  test("a restarted initial wait does not share or postpone around a stopped run", async () => {
    let resolveCheck: (result: AdapterResult) => void = () => {};
    const check = vi.fn(
      () =>
        new Promise<AdapterResult>((resolve) => {
          resolveCheck = resolve;
        }),
    );
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const scheduler = new Scheduler();
    const config = scheduled(check, { intervalMs: 100, jitterMs: 40 }, "db", 25);
    scheduler.start([config]);
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();

    random.mockReturnValue(LATEST);
    scheduler.start([config]);
    try {
      expect(scheduler.prepareScheduled(config, 25)).toBeUndefined();
      expect(check).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(50);
      expect(scheduler.prepareScheduled(config, 25)).toBeUndefined();
      resolveCheck({ status: "ok" });
      await vi.advanceTimersByTimeAsync(0);
      expect(scheduler.getCache("db")).toBeUndefined();
      await vi.advanceTimersByTimeAsync(89);
      expect(check).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(check).toHaveBeenCalledTimes(2);
    } finally {
      scheduler.stop();
    }
  });

  test("close cancels a delay that has not started", async () => {
    vi.spyOn(Math, "random").mockReturnValue(LATEST);
    const check = vi.fn(async () => ({ status: "ok" as const }));
    const kit = createHealthKit({
      checks: [scheduled(check, { intervalMs: 100, jitterMs: 50 })],
    });
    kit.start();
    await vi.advanceTimersByTimeAsync(49);
    expect(check).not.toHaveBeenCalled();
    const closing = kit.close();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(check).not.toHaveBeenCalled();
    await closing;
  });

  test("a probe during the initial delay keeps the check deadline and shares one run", async () => {
    vi.spyOn(Math, "random").mockReturnValue(LATEST);
    let signal: AbortSignal | undefined;
    let resolveCheck: (result: AdapterResult) => void = () => {};
    const check = vi.fn((context?: CheckContext) => {
      signal = context?.signal;
      return new Promise<AdapterResult>((resolve) => {
        resolveCheck = resolve;
      });
    });
    const kit = createHealthKit({
      checks: [scheduled(check, { intervalMs: 100, jitterMs: 80 }, "db", 25)],
    });
    kit.start();
    try {
      const pending = Promise.all([kit.handleReadiness(), kit.handleReadiness()]);
      await vi.advanceTimersByTimeAsync(0);
      expect(check).toHaveBeenCalledTimes(1);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(24);
      expect(signal?.aborted).toBe(false);
      resolveCheck({ status: "ok", metadata: { shared: true } });
      const responses = await pending;
      for (const response of responses) {
        expect(response.status).toBe(200);
        expect(JSON.parse(response.body).checks.db).toMatchObject({
          status: "ok",
          latency: 0,
          cachedAt: expect.any(String),
          metadata: { shared: true },
        });
      }
      expect(check).toHaveBeenCalledTimes(1);
      // Promotion at t=0 armed the refresh for t=180. The clock is at t=24.
      await vi.advanceTimersByTimeAsync(155);
      expect(check).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(check).toHaveBeenCalledTimes(2);
    } finally {
      kit.stop();
    }
  });

  test("a probe that arrives during jitter still times out at the check deadline", async () => {
    vi.spyOn(Math, "random").mockReturnValue(LATEST);
    let signal: AbortSignal | undefined;
    const check = vi.fn((context?: CheckContext) => {
      signal = context?.signal;
      return new Promise<AdapterResult>(() => {});
    });
    const kit = createHealthKit({
      checks: [scheduled(check, { intervalMs: 100, jitterMs: 80 }, "db", 25)],
    });
    kit.start();
    try {
      const pending = kit.handleReadiness();
      await vi.advanceTimersByTimeAsync(24);
      expect(check).toHaveBeenCalledTimes(1);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const response = await pending;
      expect(response.status).toBe(503);
      expect(JSON.parse(response.body).checks.db.error).toContain("timed out after 25ms");
      expect(signal?.aborted).toBe(true);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(check).toHaveBeenCalledTimes(1);
    } finally {
      kit.stop();
    }
  });

  test("does not serve a cached success past interval plus jitter plus timeout", async () => {
    vi.spyOn(Math, "random").mockReturnValue(LATEST);
    let releaseRefresh: (result: AdapterResult) => void = () => {};
    const check = vi
      .fn<() => Promise<AdapterResult>>()
      .mockResolvedValueOnce({ status: "ok" })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseRefresh = resolve;
          }),
      );
    const kit = createHealthKit({
      checks: [scheduled(check, { intervalMs: 100, jitterMs: 40 }, "db", 25)],
    });
    kit.start();
    try {
      await vi.advanceTimersByTimeAsync(40);
      expect(check).toHaveBeenCalledTimes(1);
      expect((await kit.handleReadiness()).status).toBe(200);

      await vi.advanceTimersByTimeAsync(139);
      expect(check).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(check).toHaveBeenCalledTimes(2);

      // Cached at t=40. The limit is 100 + 40 + 25, so t=205. The hung refresh
      // started at t=180 and reaches its own deadline at that same instant.
      await vi.advanceTimersByTimeAsync(24);
      expect((await kit.handleReadiness()).status).toBe(200);
      await vi.advanceTimersByTimeAsync(1);
      const failed = await kit.handleReadiness();
      expect(failed.status).toBe(503);
      expect(JSON.parse(failed.body).checks.db.error).toContain("timed out after 25ms");
      await vi.advanceTimersByTimeAsync(1_000);
      expect(check).toHaveBeenCalledTimes(2);
    } finally {
      releaseRefresh({ status: "ok" });
      await vi.advanceTimersByTimeAsync(0);
      kit.stop();
    }
  });

  test("uses captured jitter after the original schedule is mutated", async () => {
    vi.spyOn(Math, "random").mockReturnValue(LATEST);
    const schedule: NonNullable<CheckConfig["schedule"]> = { intervalMs: 100, jitterMs: 40 };
    const check = vi.fn(async () => ({ status: "ok" as const }));
    const kit = createHealthKit({
      checks: [
        {
          name: "db",
          type: ["readiness"],
          adapter: { check },
          schedule,
        },
      ],
    });
    schedule.jitterMs = 0;
    schedule.intervalMs = 1;
    kit.start();
    try {
      await vi.advanceTimersByTimeAsync(39);
      expect(check).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(check).toHaveBeenCalledTimes(1);
    } finally {
      kit.stop();
    }
  });

  test("splits a refresh delay that would overflow the timer limit", async () => {
    vi.spyOn(Math, "random").mockReturnValue(LATEST);
    const timeouts = vi.spyOn(globalThis, "setTimeout");
    const check = vi.fn(async () => ({ status: "ok" as const }));
    const scheduler = new Scheduler();
    scheduler.start([
      scheduled(check, { intervalMs: MAX_TIMER_MS, jitterMs: MAX_TIMER_MS }, "db", 25),
    ]);
    try {
      expect(check).not.toHaveBeenCalled();
      expect(timeouts.mock.calls.map((call) => call[1])).toContain(MAX_TIMER_MS);
      await vi.advanceTimersByTimeAsync(MAX_TIMER_MS - 1);
      expect(check).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(check).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2 * MAX_TIMER_MS - 1);
      expect(check).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(check).toHaveBeenCalledTimes(2);
      expect(timeouts.mock.calls.every((call) => Number(call[1]) <= MAX_TIMER_MS)).toBe(true);
    } finally {
      scheduler.stop();
    }
  });
});

function scheduled(
  check: CheckConfig["adapter"]["check"],
  schedule: NonNullable<CheckConfig["schedule"]>,
  name = "db",
  timeout?: number,
): CheckConfig {
  return {
    name,
    type: ["readiness"],
    adapter: { check },
    schedule,
    ...(timeout !== undefined && { timeout }),
  };
}
