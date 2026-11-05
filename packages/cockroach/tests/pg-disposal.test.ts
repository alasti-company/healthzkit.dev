import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { cockroachPgAdapter } from "../src/pg.ts";

afterEach(() => {
  vi.doUnmock("pg");
  vi.resetModules();
});

describe("cockroachPgAdapter disposal", () => {
  function fixture() {
    const borrowed = { query: vi.fn().mockResolvedValue({}), release: vi.fn() };
    const client = {
      connect: vi.fn().mockResolvedValue(borrowed),
      query: borrowed.query,
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
    const adapter = cockroachPgAdapter({ connectionString: "postgres://localhost/db" });
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
    const adapter = cockroachPgAdapter({ client: resource } as never);
    expect((await adapter.check()).status).toBe("ok");
    await adapter.dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  test("does not initialize an unused resource during disposal", async () => {
    const { cleanup, construct } = fixture();
    await cockroachPgAdapter({ connectionString: "postgres://localhost/db" }).dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });
});
