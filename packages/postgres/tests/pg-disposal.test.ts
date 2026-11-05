import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { pgAdapter } from "../src/pg.ts";

afterEach(() => {
  vi.doUnmock("pg");
  vi.resetModules();
});

describe("pgAdapter disposal", () => {
  function fixture() {
    const borrowed = { query: vi.fn().mockResolvedValue({}), release: vi.fn() };
    const client = {
      connect: vi.fn().mockResolvedValue(borrowed),
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
    };
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const resource = { ...client, end: cleanup };
    const construct = vi.fn(function () {
      return resource;
    });
    vi.doMock("pg", () => ({ Pool: construct }));
    return { resource, cleanup, construct };
  }

  test("disposes one lazily owned resource after concurrent checks, exactly once", async () => {
    const { cleanup, construct } = fixture();
    const adapter = pgAdapter({ connectionString: "postgres://localhost/db" });
    const results = await Promise.all([adapter.check(), adapter.check()]);
    expect(results.map((result) => result.status)).toEqual(["ok", "ok"]);
    const closing = adapter.dispose!();
    expect(adapter.dispose!()).toBe(closing);
    await closing;
    await adapter.dispose!();
    expect(construct).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
    expect((await adapter.check()).status).toBe("fail");
  });

  test("never cleans up a supplied resource", async () => {
    const { resource, cleanup, construct } = fixture();
    const adapter = pgAdapter({ client: resource } as never);
    expect((await adapter.check()).status).toBe("ok");
    await adapter.dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  test("does not initialize an unused resource during disposal", async () => {
    const { cleanup, construct } = fixture();
    await pgAdapter({ connectionString: "postgres://localhost/db" }).dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  test("waits for initialization, queries, and metadata before ending the pool", async () => {
    const { cleanup } = fixture();
    let finish!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const adapter = pgAdapter({
      connectionString: "postgres://localhost/db",
      metadata: async () => {
        entered();
        await pending;
        return {};
      },
    });
    const check = adapter.check();
    const closing = adapter.dispose!();
    await started;
    expect(cleanup).not.toHaveBeenCalled();
    finish();
    expect((await check).status).toBe("ok");
    await closing;
    expect(cleanup).toHaveBeenCalledOnce();
  });

  test("preserves a pool cleanup failure without retrying", async () => {
    const { cleanup } = fixture();
    const error = new Error("end failed");
    cleanup.mockRejectedValue(error);
    const adapter = pgAdapter({ connectionString: "postgres://localhost/db" });
    await adapter.check();
    const closing = adapter.dispose!();
    await expect(closing).rejects.toBe(error);
    expect(adapter.dispose!()).toBe(closing);
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
