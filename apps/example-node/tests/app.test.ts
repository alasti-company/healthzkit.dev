import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Pool } from "pg";
import { createApplication } from "../src/app.ts";
import { createShutdown } from "../src/shutdown.ts";

function mockPool(fail = false) {
  const query = vi.fn(async () => {
    if (fail) throw new Error("password=secret internal-host");
    return { rows: [] };
  });
  const release = vi.fn();
  const end = vi.fn();
  const pool = {
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
    connect: vi.fn(async () => ({ query, release })),
    query,
    end,
  };
  return { pool: pool as unknown as Pool, query, release, end };
}

afterEach(() => vi.useRealTimers());

describe("production probes", () => {
  it("shares the app pool, releases borrowed clients, and keeps ownership with the app", async () => {
    const { pool, query, release, end } = mockPool();
    const application = createApplication(pool);
    expect((await application.app.request("/healthz/ready")).status).toBe(200);
    expect((await application.app.request("/")).status).toBe(200);
    expect(query).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledTimes(1);
    application.beginDrain();
    expect((await application.app.request("/healthz/ready")).status).toBe(503);
    expect((await application.app.request("/healthz/live")).status).toBe(200);
    expect((await application.app.request("/")).status).toBe(503);
    expect(end).not.toHaveBeenCalled();
  });

  it("fails readiness without failing liveness or exposing driver errors", async () => {
    const application = createApplication(mockPool(true).pool);
    const response = await application.app.request("/healthz/ready");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/secret|internal-host|password/);
    expect((await application.app.request("/healthz/live")).status).toBe(200);
    expect(await (await application.app.request("/")).text()).not.toContain("secret");
  });
});

describe("shutdown", () => {
  it("is idempotent and drains before closing HTTP and then the shared pool", async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const forceExit = vi.fn();
    const shutdown = createShutdown({
      beginDrain: () => {
        events.push("drain");
      },
      closeServer: async () => {
        events.push("server");
      },
      closePool: async () => {
        events.push("pool");
      },
      forceExit,
      drainMs: 5_000,
      deadlineMs: 25_000,
    });
    const first = shutdown();
    expect(shutdown()).toBe(first);
    expect(events).toEqual(["drain"]);
    await vi.advanceTimersByTimeAsync(5_000);
    await first;
    expect(events).toEqual(["drain", "server", "pool"]);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(forceExit).not.toHaveBeenCalled();
  });

  it("enforces a hard deadline when active requests cannot finish", async () => {
    vi.useFakeTimers();
    const forceExit = vi.fn();
    const closePool = vi.fn();
    const shutdown = createShutdown({
      beginDrain: vi.fn(),
      closeServer: () => new Promise<void>(() => {}),
      closePool,
      forceExit,
      drainMs: 5_000,
      deadlineMs: 25_000,
    });
    void shutdown();
    await vi.advanceTimersByTimeAsync(25_000);
    expect(forceExit).toHaveBeenCalledOnce();
    expect(closePool).not.toHaveBeenCalled();
  });
});
