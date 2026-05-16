import { describe, expect, test, vi } from "vite-plus/test";
import { mysqlAdapter } from "../src/mysql.ts";

function mockConnection(
  overrides: {
    query?: (sql: string, cb: (err: Error | null, rows?: unknown) => void) => void;
    release?: () => void;
  } = {},
) {
  const query = vi.fn(
    overrides.query ??
      ((_sql, cb) => {
        cb(null, [{ "1": 1 }]);
      }),
  );
  const release = vi.fn(overrides.release);
  return { query, release };
}

function mockPool(connection: ReturnType<typeof mockConnection>) {
  const getConnection = vi.fn((cb: (err: Error | null, conn: typeof connection) => void) => {
    cb(null, connection);
  });
  return { getConnection };
}

describe("mysqlAdapter", () => {
  test("fails when neither connectionString nor client is provided", async () => {
    const adapter = mysqlAdapter({} as never);
    const result = await adapter.check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "mysqlAdapter: provided a non-empty connectionString or a client",
    );
  });

  test("fails when connectionString is empty", async () => {
    const adapter = mysqlAdapter({ connectionString: "" });
    const result = await adapter.check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "mysqlAdapter: provided a non-empty connectionString or a client",
    );
  });

  test("runs default query on injected connection and returns ok with latency", async () => {
    const connection = mockConnection();
    const adapter = mysqlAdapter({ client: connection as never });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(connection.query).toHaveBeenCalledWith("SELECT 1", expect.any(Function));
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("runs custom query when provided", async () => {
    const connection = mockConnection();
    const adapter = mysqlAdapter({ client: connection as never, query: "SELECT VERSION()" });
    await adapter.check();

    expect(connection.query).toHaveBeenCalledWith("SELECT VERSION()", expect.any(Function));
  });

  test("acquires from pool, queries, and releases connection", async () => {
    const connection = mockConnection();
    const pool = mockPool(connection);
    const adapter = mysqlAdapter({ client: pool as never });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(pool.getConnection).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  test("returns fail when query rejects", async () => {
    const connection = mockConnection({
      query: (_sql, cb) => cb(new Error("access denied")),
    });
    const result = await mysqlAdapter({ client: connection as never }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("access denied");
  });

  test("returns fail when pool getConnection rejects", async () => {
    const pool = {
      getConnection: (cb: (err: Error) => void) => cb(new Error("pool exhausted")),
    };
    const result = await mysqlAdapter({ client: pool as never }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("pool exhausted");
  });

  test("includes metadata from optional metadata hook", async () => {
    const connection = mockConnection();
    const adapter = mysqlAdapter({
      client: connection as never,
      metadata: async (c) => {
        expect(c).toBe(connection);
        return { engine: "InnoDB" };
      },
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({ engine: "InnoDB", latencyMs: expect.any(Number) });
  });

  test("reuses internal pool across checks when using connectionString", async () => {
    const createPool = vi.fn(() => mockPool(mockConnection()));
    vi.doMock("mysql", () => ({ createPool }));

    try {
      const { mysqlAdapter: adapterFactory } = await import("../src/mysql.ts");
      const adapter = adapterFactory({
        connectionString: "mysql://user:pass@db.example:3306/app",
        connectionOptions: { connectTimeout: 2000 },
      });

      await adapter.check();
      await adapter.check();

      expect(createPool).toHaveBeenCalledOnce();
      expect(createPool).toHaveBeenCalledWith({
        host: "db.example",
        port: 3306,
        user: "user",
        password: "pass",
        database: "app",
        connectTimeout: 2000,
      });
    } finally {
      vi.doUnmock("mysql");
      vi.resetModules();
    }
  });

  test("accepts mysql2:// connection strings", async () => {
    const createPool = vi.fn(() => mockPool(mockConnection()));
    vi.doMock("mysql", () => ({ createPool }));

    try {
      const { mysqlAdapter: adapterFactory } = await import("../src/mysql.ts");
      const adapter = adapterFactory({
        connectionString: "mysql2://localhost/testdb",
      });

      const result = await adapter.check();
      expect(result.status).toBe("ok");
      expect(createPool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: "localhost",
          port: 3306,
          database: "testdb",
        }),
      );
    } finally {
      vi.doUnmock("mysql");
      vi.resetModules();
    }
  });

  test("fails when connectionString protocol is invalid", async () => {
    const adapter = mysqlAdapter({
      connectionString: "postgres://localhost/db",
    });
    const result = await adapter.check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "mysqlAdapter: invalid protocol in connectionString: postgres. expected mysql:// or mysql2://",
    );
  });
});
