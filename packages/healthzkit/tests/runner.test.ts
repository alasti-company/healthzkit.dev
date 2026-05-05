import { describe, expect, test } from "vite-plus/test";
import { runChecks } from "../src/runner.ts";
import type { Scheduler } from "../src/scheduler.ts";
import type { CheckConfig } from "../src/types.ts";

function schedulerWithCache(
  entries: Record<string, { result: import("../src/types.ts").AdapterResult; cachedAt: Date }>,
): Scheduler {
  return {
    getCache: (name: string) => entries[name],
  } as Scheduler;
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
