import { describe, expect, test, vi } from "vite-plus/test";
import { runChecks } from "../src/runner.ts";
import { Scheduler } from "../src/scheduler.ts";
import type { CheckConfig } from "../src/types.ts";

function schedulerWithCache(
  entries: Record<string, { result: import("../src/types.ts").AdapterResult; cachedAt: Date }>,
): Pick<Scheduler, "getCache" | "getPending" | "runCheck"> {
  const scheduler = new Scheduler();
  return {
    runCheck: (check, timeoutMs) => scheduler.runCheck(check, timeoutMs),
    getCache: (name: string) => entries[name],
    getPending: () => undefined,
  };
}

describe("src/runner.ts", () => {
  test("runs adapter and records status and latency", async () => {
    const scheduler = schedulerWithCache({});
    const checks: CheckConfig[] = [
      { name: "one", type: ["liveness"], adapter: { check: async () => ({ status: "ok" }) } },
    ];
    const out = await runChecks(checks, scheduler);
    expect(out.one.status).toBe("ok");
    expect(out.one.latency).toBeGreaterThanOrEqual(0);
    expect(out.one.cachedAt).toBeUndefined();
  });

  test("uses scheduler cache with zero latency and cachedAt", async () => {
    const fixed = new Date("2024-06-01T12:00:00.000Z");
    const scheduler = schedulerWithCache({
      c: { result: { status: "ok", metadata: { k: 1 } }, cachedAt: fixed },
    });
    const checks: CheckConfig[] = [
      { name: "c", type: ["liveness"], adapter: { check: async () => ({ status: "fail" }) } },
    ];
    const out = await runChecks(checks, scheduler);
    expect(out.c.status).toBe("ok");
    expect(out.c.latency).toBe(0);
    expect(out.c.cachedAt).toBe(fixed.toISOString());
    expect(out.c.metadata).toEqual({ k: 1 });
  });

  test("onFail.treatAs remaps failed adapter status", async () => {
    const scheduler = schedulerWithCache({});
    const checks: CheckConfig[] = [
      {
        name: "x",
        type: ["liveness"],
        adapter: { check: async () => ({ status: "fail" }) },
        onFail: { treatAs: "degraded" },
      },
    ];
    const out = await runChecks(checks, scheduler);
    expect(out.x.status).toBe("degraded");
  });

  test("exposeError false omits error field", async () => {
    const scheduler = schedulerWithCache({});
    const checks: CheckConfig[] = [
      {
        name: "x",
        type: ["liveness"],
        adapter: { check: async () => ({ status: "fail", error: "nope" }) },
      },
    ];
    const out = await runChecks(checks, scheduler, 5_000, false);
    expect(out.x.error).toBeUndefined();
  });

  test("string adapter error is copied to result.error", async () => {
    const scheduler = schedulerWithCache({});
    const checks: CheckConfig[] = [
      {
        name: "x",
        type: ["liveness"],
        adapter: { check: async () => ({ status: "fail", error: "plain" }) },
      },
    ];
    const out = await runChecks(checks, scheduler);
    expect(out.x.error).toBe("plain");
  });

  test("adapter throw becomes failed check", async () => {
    const scheduler = schedulerWithCache({});
    const checks: CheckConfig[] = [
      {
        name: "x",
        type: ["liveness"],
        adapter: {
          check: async () => {
            throw new Error("boom");
          },
        },
      },
    ];
    const out = await runChecks(checks, scheduler);
    expect(out.x.status).toBe("fail");
    expect(out.x.error).toBe("boom");
  });

  test("check-specific timeout overrides default", async () => {
    const scheduler = schedulerWithCache({});
    const checks: CheckConfig[] = [
      {
        name: "slow",
        type: ["liveness"],
        adapter: { check: () => new Promise(() => {}) },
        timeout: 25,
      },
    ];
    const out = await runChecks(checks, scheduler, 60_000);
    expect(out.slow.status).toBe("fail");
    expect(out.slow.error).toMatch(/timed out/);
  });
});

describe("scheduled cache freshness", () => {
  test.each([undefined, 20])("fails at interval plus effective timeout (%s)", async (timeout) => {
    const cachedAt = new Date(Date.now() - 100 - (timeout ?? 50));
    const check = () => {
      throw new Error("stale cache must not trigger an on-demand check");
    };
    const scheduler = schedulerWithCache({
      db: { result: { status: "ok", metadata: { old: true } }, cachedAt },
    });
    const checks: CheckConfig[] = [
      {
        name: "db",
        type: ["readiness"],
        adapter: { check },
        schedule: { intervalMs: 100 },
        timeout,
      },
    ];
    const out = await runChecks(checks, scheduler, 50);
    expect(out.db.status).toBe("fail");
    expect(out.db.error).toContain("cached result is stale");
    expect(out.db.metadata).toBeUndefined();
    expect(out.db.cachedAt).toBe(cachedAt.toISOString());
    expect(out.db.latency).toBe(0);
    checks[0].onFail = { treatAs: "degraded" };
    const hidden = await runChecks(checks, scheduler, 50, false);
    expect(hidden.db.status).toBe("degraded");
    expect(hidden.db.error).toBeUndefined();
  });

  test("keeps the interval-plus-timeout limit when jitter is omitted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    try {
      const timeoutMs = 20;
      const intervalMs = 100;
      const limit = intervalMs + timeoutMs;
      const checks: CheckConfig[] = [
        {
          name: "db",
          type: ["readiness"],
          adapter: {
            check: () => {
              throw new Error("stale cache must not run");
            },
          },
          schedule: { intervalMs },
          timeout: timeoutMs,
        },
      ];
      const fresh = await runChecks(
        checks,
        schedulerWithCache({
          db: { result: { status: "ok" }, cachedAt: new Date(Date.now() - (limit - 1)) },
        }),
      );
      expect(fresh.db.status).toBe("ok");
      const stale = await runChecks(
        checks,
        schedulerWithCache({
          db: { result: { status: "ok" }, cachedAt: new Date(Date.now() - limit) },
        }),
      );
      expect(stale.db.status).toBe("fail");
      expect(stale.db.error).toBe(`Check "db" cached result is stale after ${limit}ms`);
    } finally {
      vi.useRealTimers();
    }
  });

  test("extends the freshness limit by jitter and fails at that bound", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    try {
      const timeoutMs = 20;
      const intervalMs = 100;
      const jitterMs = 30;
      const limit = intervalMs + jitterMs + timeoutMs;
      const checks: CheckConfig[] = [
        {
          name: "db",
          type: ["readiness"],
          adapter: {
            check: () => {
              throw new Error("stale cache must not run");
            },
          },
          schedule: { intervalMs, jitterMs },
          timeout: timeoutMs,
        },
      ];
      const read = (age: number) =>
        runChecks(
          checks,
          schedulerWithCache({
            db: {
              result: { status: "ok", metadata: { old: true } },
              cachedAt: new Date(Date.now() - age),
            },
          }),
        );
      const withinOldLimit = await read(intervalMs + timeoutMs);
      expect(withinOldLimit.db.status).toBe("ok");
      const stillFresh = await read(limit - 1);
      expect(stillFresh.db.status).toBe("ok");
      expect(stillFresh.db.metadata).toEqual({ old: true });
      const stale = await read(limit);
      expect(stale.db.status).toBe("fail");
      expect(stale.db.error).toBe(`Check "db" cached result is stale after ${limit}ms`);
      expect(stale.db.metadata).toBeUndefined();
      expect(stale.db.latency).toBe(0);
      const beyond = await read(limit + 1);
      expect(beyond.db.status).toBe("fail");
      expect(beyond.db.error).toBe(`Check "db" cached result is stale after ${limit}ms`);
    } finally {
      vi.useRealTimers();
    }
  });

  test("uses a scheduled result while it is still fresh", async () => {
    const scheduler = schedulerWithCache({
      db: { result: { status: "ok" }, cachedAt: new Date() },
    });
    const out = await runChecks(
      [
        {
          name: "db",
          type: ["readiness"],
          adapter: { check: async () => ({ status: "fail" }) },
          schedule: { intervalMs: 100 },
        },
      ],
      scheduler,
      50,
    );
    expect(out.db.status).toBe("ok");
  });
});
