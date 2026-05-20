import { describe, expect, test, vi } from "vite-plus/test";
import { betterSqlite3Adapter } from "../src/better-sqlite3.ts";

function mockDatabase(
  overrides: {
    get?: () => unknown;
    prepare?: (sql: string) => { get: () => unknown };
  } = {},
) {
  const get = vi.fn(overrides.get ?? (() => ({ ok: 1 })));
  const prepare = vi.fn(
    overrides.prepare ??
      ((sql: string) => {
        void sql;
        return { get };
      }),
  );
  return { prepare, get };
}

describe("betterSqlite3Adapter", () => {
  test("fails when neither connectionString nor client is provided", async () => {
    const adapter = betterSqlite3Adapter({} as never);
    const result = await adapter.check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "betterSqlite3Adapter: provide a non-empty connectionString or a client",
    );
  });

  test("fails when connectionString is empty", async () => {
    const adapter = betterSqlite3Adapter({ connectionString: "" });
    const result = await adapter.check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "betterSqlite3Adapter: provide a non-empty connectionString or a client",
    );
  });

  test("runs default query on injected client and returns ok with latency", async () => {
    const db = mockDatabase();
    const adapter = betterSqlite3Adapter({ client: db as never });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(db.prepare).toHaveBeenCalledWith("SELECT 1");
    expect(db.get).toHaveBeenCalledOnce();
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("runs custom query when provided", async () => {
    const db = mockDatabase();
    const adapter = betterSqlite3Adapter({
      client: db as never,
      query: "SELECT sqlite_version()",
    });
    await adapter.check();

    expect(db.prepare).toHaveBeenCalledWith("SELECT sqlite_version()");
  });

  test("returns fail when prepare throws", async () => {
    const db = {
      prepare: () => {
        throw new Error("malformed query");
      },
    };
    const result = await betterSqlite3Adapter({ client: db as never }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("malformed query");
  });

  test("includes metadata from optional metadata hook", async () => {
    const db = mockDatabase();
    const adapter = betterSqlite3Adapter({
      client: db as never,
      metadata: (c) => {
        expect(c).toBe(db);
        return { journal_mode: "wal" };
      },
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      journal_mode: "wal",
      latencyMs: expect.any(Number),
    });
  });

  test("awaits async metadata hook", async () => {
    const db = mockDatabase();
    const adapter = betterSqlite3Adapter({
      client: db as never,
      metadata: async () => ({ pages: 42 }),
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({ pages: 42, latencyMs: expect.any(Number) });
  });

  test("reuses internal database across checks when using connectionString", async () => {
    const db = mockDatabase();
    const DatabaseCtor = vi.fn(function (_path: string, _options?: unknown) {
      return db;
    });
    vi.doMock("better-sqlite3", () => ({ default: DatabaseCtor }));

    vi.resetModules();
    try {
      const { betterSqlite3Adapter: adapterFactory } = await import("../src/better-sqlite3.ts");
      const adapter = adapterFactory({
        connectionString: ":memory:",
        options: { readonly: true },
      });

      await adapter.check();
      await adapter.check();

      expect(DatabaseCtor).toHaveBeenCalledOnce();
      expect(DatabaseCtor).toHaveBeenCalledWith(":memory:", { readonly: true });
      expect(db.prepare).toHaveBeenCalledTimes(2);
    } finally {
      vi.doUnmock("better-sqlite3");
      vi.resetModules();
    }
  });
});
