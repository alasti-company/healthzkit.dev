import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { sqlite3Adapter } from "../src/sqlite3.ts";

afterEach(() => {
  vi.doUnmock("sqlite3");
  vi.resetModules();
});

describe("sqlite3Adapter disposal", () => {
  function fixture() {
    const client = {
      get: (_sql: unknown, done: (error: null, value: unknown) => void) => done(null, {}),
    };
    const cleanup = vi.fn((done?: (error: null) => void) => {
      done?.(null);
    });
    const resource = { ...client, close: cleanup };
    const construct = vi.fn(function (
      _path: unknown,
      _mode: unknown,
      done?: (error: null) => void,
    ) {
      queueMicrotask(() => done?.(null));
      return resource;
    });
    vi.doMock("sqlite3", () => ({ default: { Database: construct }, Database: construct }));
    return { resource, cleanup, construct };
  }

  test("disposes one lazily owned resource after concurrent checks, exactly once", async () => {
    const { cleanup, construct } = fixture();
    const adapter = sqlite3Adapter({ connectionString: ":memory:" });
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
    const adapter = sqlite3Adapter({ client: resource } as never);
    expect((await adapter.check()).status).toBe("ok");
    await adapter.dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  test("does not initialize an unused resource during disposal", async () => {
    const { cleanup, construct } = fixture();
    await sqlite3Adapter({ connectionString: ":memory:" }).dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });
});
