import { describe, expect, test, vi } from "vite-plus/test";
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
