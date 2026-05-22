import { describe, expect, test, vi } from "vite-plus/test";
import { drizzleAdapter } from "../src/drizzle.ts";

function mockPgDb() {
  const execute = vi.fn(async () => ({}));
  const client = { query: vi.fn(), totalCount: 3 };
  return {
    execute,
    session: { client, query: {} },
  };
}

function mockMysqlDb() {
  const execute = vi.fn(async () => ({}));
  const client = { execute: vi.fn() };
  return {
    execute,
    session: { client, execute: {} },
  };
}

function mockSqliteSyncDb() {
  const run = vi.fn();
  const client = { prepare: vi.fn() };
  return {
    run,
    session: { client, run: {} },
  };
}

function mockSqliteAsyncDb() {
  const run = vi.fn(async () => []);
  const client = { prepare: vi.fn() };
  return {
    run,
    session: { client, syncRun: {} },
  };
}

describe("drizzleAdapter", () => {
  test("pg: runs default query via execute and returns ok", async () => {
    const db = mockPgDb();
    const result = await drizzleAdapter({ db: db as never }).check();

    expect(result.status).toBe("ok");
    expect(db.execute).toHaveBeenCalledWith("SELECT 1");
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("pg: uses custom query", async () => {
    const db = mockPgDb();
    await drizzleAdapter({ db: db as never, query: "SELECT 2" }).check();

    expect(db.execute).toHaveBeenCalledWith("SELECT 2");
  });

  test("pg: driver override bypasses mysql session markers", async () => {
    const db = mockPgDb();
    (db.session as { execute?: unknown }).execute = {};
    await drizzleAdapter({ db: db as never, driver: "pg" }).check();

    expect(db.execute).toHaveBeenCalledWith("SELECT 1");
  });

  test("mysql: runs query via execute", async () => {
    const db = mockMysqlDb();
    const result = await drizzleAdapter({ db: db as never }).check();

    expect(result.status).toBe("ok");
    expect(db.execute).toHaveBeenCalledWith("SELECT 1");
  });

  test("sqlite sync: runs query via run without awaiting", async () => {
    const db = mockSqliteSyncDb();
    const result = await drizzleAdapter({ db: db as never }).check();

    expect(result.status).toBe("ok");
    expect(db.run).toHaveBeenCalledWith("SELECT 1");
  });

  test("sqlite async: awaits run when it returns a promise", async () => {
    const db = mockSqliteAsyncDb();
    const result = await drizzleAdapter({ db: db as never }).check();

    expect(result.status).toBe("ok");
    expect(db.run).toHaveBeenCalledWith("SELECT 1");
  });

  test("unknown driver: falls back to execute", async () => {
    const execute = vi.fn(async () => ({}));
    const db = { execute, session: { client: {} } };
    const result = await drizzleAdapter({ db: db as never }).check();

    expect(result.status).toBe("ok");
    expect(execute).toHaveBeenCalledWith("SELECT 1");
  });

  test("returns fail when the probe throws", async () => {
    const db = {
      execute: vi.fn(async () => {
        throw new Error("connection refused");
      }),
      session: { client: {}, query: {} },
    };
    const result = await drizzleAdapter({ db: db as never }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("connection refused");
  });

  test("includes sync metadata from underlying client", async () => {
    const db = mockPgDb();
    const result = await drizzleAdapter({
      db: db as never,
      metadata: (client) => ({ totalCount: (client as { totalCount: number }).totalCount }),
    }).check();

    expect(result.status).toBe("ok");
    expect(result.metadata?.totalCount).toBe(3);
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("includes async metadata from underlying client", async () => {
    const db = mockPgDb();
    const result = await drizzleAdapter({
      db: db as never,
      metadata: async (client) => ({
        totalCount: (client as { totalCount: number }).totalCount,
      }),
    }).check();

    expect(result.status).toBe("ok");
    expect(result.metadata?.totalCount).toBe(3);
  });

  test("skips metadata when session client is missing", async () => {
    const execute = vi.fn(async () => ({}));
    const metadata = vi.fn(() => ({ extra: true }));
    const db = { execute, session: {} };

    const result = await drizzleAdapter({
      db: db as never,
      metadata,
    }).check();

    expect(result.status).toBe("ok");
    expect(metadata).not.toHaveBeenCalled();
    expect(result.metadata?.extra).toBeUndefined();
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
