import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { mysqlAdapter } from "../src/mysql.ts";

afterEach(() => {
  vi.doUnmock("mysql");
  vi.resetModules();
});

describe("mysqlAdapter disposal", () => {
  function fixture() {
    const borrowed = {
      query: (_sql: unknown, done: (error: null) => void) => done(null),
      release: vi.fn(),
    };
    const client = {
      getConnection: (done: (error: null, value: unknown) => void) => done(null, borrowed),
    };
    const cleanup = vi.fn((done?: (error: null) => void) => {
      done?.(null);
    });
    const resource = { ...client, end: cleanup };
    const construct = vi.fn(function () {
      return resource;
    });
    vi.doMock("mysql", () => ({ createPool: construct }));
    return { resource, cleanup, construct };
  }

  test("disposes one lazily owned resource after concurrent checks, exactly once", async () => {
    const { cleanup, construct } = fixture();
    const adapter = mysqlAdapter({ connectionString: "mysql://localhost/db" });
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
    const adapter = mysqlAdapter({ client: resource } as never);
    expect((await adapter.check()).status).toBe("ok");
    await adapter.dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  test("does not initialize an unused resource during disposal", async () => {
    const { cleanup, construct } = fixture();
    await mysqlAdapter({ connectionString: "mysql://localhost/db" }).dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });
});
