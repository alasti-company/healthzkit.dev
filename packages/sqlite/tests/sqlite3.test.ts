import { describe, expect, test, vi } from "vite-plus/test";
import { sqlite3Adapter } from "../src/sqlite3.ts";

function mockDatabase(
  overrides: {
    get?: (sql: string, cb: (err: Error | null) => void) => void;
  } = {},
) {
  const get = vi.fn(
    overrides.get ??
      ((_sql: string, cb: (err: Error | null) => void) => {
        cb(null);
      }),
  );
  return { get };
}

describe("sqlite3Adapter", () => {
  test("fails when neither connectionString nor client is provided", async () => {
    const adapter = sqlite3Adapter({} as never);
    const result = await adapter.check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "sqlite3Adapter: provide a non-empty connectionString or a client",
    );
  });

  test("fails when connectionString is empty", async () => {
    const adapter = sqlite3Adapter({ connectionString: "" });
    const result = await adapter.check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "sqlite3Adapter: provide a non-empty connectionString or a client",
    );
  });

  test("runs default query on injected client and returns ok with latency", async () => {
    const db = mockDatabase();
    const adapter = sqlite3Adapter({ client: db as never });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(db.get).toHaveBeenCalledWith("SELECT 1", expect.any(Function));
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("runs custom query when provided", async () => {
    const db = mockDatabase();
    const adapter = sqlite3Adapter({
      client: db as never,
      query: "SELECT changes()",
    });
    await adapter.check();

    expect(db.get).toHaveBeenCalledWith("SELECT changes()", expect.any(Function));
  });

  test("returns fail when query callback receives an error", async () => {
    const db = mockDatabase({
      get: (_sql, cb) => {
        cb(new Error("SQLITE_BUSY"));
      },
    });
    const result = await sqlite3Adapter({ client: db as never }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("SQLITE_BUSY");
  });

  test("includes metadata from optional metadata hook", async () => {
    const db = mockDatabase();
    const adapter = sqlite3Adapter({
      client: db as never,
      metadata: async (c) => {
        expect(c).toBe(db);
        return { encoding: "UTF-8" };
      },
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      encoding: "UTF-8",
      latencyMs: expect.any(Number),
    });
  });

  test("reuses internal database across checks when using connectionString", async () => {
    const db = mockDatabase();
    let openCount = 0;
    class MockSqlite3Database {
      get = db.get;

      constructor(_path: string, _mode: number, cb: (err: Error | null) => void) {
        openCount += 1;
        queueMicrotask(() => cb(null));
      }
    }

    vi.doMock("sqlite3", () => ({
      default: {
        Database: MockSqlite3Database,
        OPEN_READWRITE: 2,
        OPEN_CREATE: 4,
      },
    }));

    vi.resetModules();
    try {
      const { sqlite3Adapter: adapterFactory } = await import("../src/sqlite3.ts");
      const adapter = adapterFactory({ connectionString: ":memory:" });

      await adapter.check();
      await adapter.check();

      expect(openCount).toBe(1);
      expect(db.get).toHaveBeenCalledTimes(2);
    } finally {
      vi.doUnmock("sqlite3");
      vi.resetModules();
    }
  });

  test("passes custom open mode when opening via connectionString", async () => {
    const db = mockDatabase();
    let openedMode: number | undefined;

    class MockSqlite3Database {
      get = db.get;

      constructor(_path: string, mode: number, cb: (err: Error | null) => void) {
        openedMode = mode;
        queueMicrotask(() => cb(null));
      }
    }

    vi.doMock("sqlite3", () => ({
      default: {
        Database: MockSqlite3Database,
        OPEN_READWRITE: 2,
        OPEN_CREATE: 4,
      },
    }));

    vi.resetModules();
    try {
      const { sqlite3Adapter: adapterFactory } = await import("../src/sqlite3.ts");
      const result = await adapterFactory({ connectionString: "test.db", mode: 1 }).check();

      expect(result.status).toBe("ok");
      expect(openedMode).toBe(1);
    } finally {
      vi.doUnmock("sqlite3");
      vi.resetModules();
    }
  });
});
