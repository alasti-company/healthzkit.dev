import { describe, expect, test, vi } from "vite-plus/test";
import { mysql2Adapter } from "../src/mysql2.ts";

function mockConnection(
  overrides: {
    query?: () => Promise<unknown>;
    release?: () => void;
  } = {},
) {
  const query = vi.fn(overrides.query ?? (async () => [[]]));
  const release = vi.fn(overrides.release);
  return { query, release };
}

function mockPool(connection: ReturnType<typeof mockConnection>) {
  return {
    getConnection: vi.fn(async () => connection),
  };
}

describe("mysql2Adapter", () => {
  test("fails when neither connectionString nor client is provided", async () => {
    const adapter = mysql2Adapter({} as never);
    const result = await adapter.check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "mysqlAdapter: provided a non-empty connectionString or a client",
    );
  });

  test("fails when connectionString is empty", async () => {
    const adapter = mysql2Adapter({ connectionString: "", connectionOptions: {} });
    const result = await adapter.check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "mysqlAdapter: provided a non-empty connectionString or a client",
    );
  });

  test("runs default query on injected connection and returns ok with latency", async () => {
    const connection = mockConnection();
    const adapter = mysql2Adapter({ client: connection as never });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(connection.query).toHaveBeenCalledWith("SELECT 1");
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("runs custom query when provided", async () => {
    const connection = mockConnection();
    const adapter = mysql2Adapter({
      client: connection as never,
      query: "SELECT VERSION()",
    });
    await adapter.check();

    expect(connection.query).toHaveBeenCalledWith("SELECT VERSION()");
  });

  test("acquires from pool, queries, and releases connection", async () => {
    const connection = mockConnection();
    const pool = mockPool(connection);
    const adapter = mysql2Adapter({ client: pool as never });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(pool.getConnection).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  test("returns fail when query rejects", async () => {
    const connection = mockConnection({
      query: async () => {
        throw new Error("connection lost");
      },
    });
    const result = await mysql2Adapter({ client: connection as never }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("connection lost");
  });

  test("returns fail when pool getConnection rejects", async () => {
    const pool = {
      getConnection: async () => {
        throw new Error("pool exhausted");
      },
    };
    const result = await mysql2Adapter({ client: pool as never }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("pool exhausted");
  });

  test("includes metadata from optional metadata hook", async () => {
    const connection = mockConnection();
    const adapter = mysql2Adapter({
      client: connection as never,
      metadata: async (c) => {
        expect(c).toBe(connection);
        return { charset: "utf8mb4" };
      },
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({ charset: "utf8mb4", latencyMs: expect.any(Number) });
  });

  test("reuses internal pool across checks when using connectionString", async () => {
    const createPool = vi.fn(() => mockPool(mockConnection()));
    vi.doMock("mysql2/promise", () => ({ createPool }));

    try {
      const { mysql2Adapter: adapterFactory } = await import("../src/mysql2.ts");
      const adapter = adapterFactory({
        connectionString: "mysql://user:pass@db.example:3307/app",
        connectionOptions: { connectionLimit: 5 },
      });

      await adapter.check();
      await adapter.check();

      expect(createPool).toHaveBeenCalledOnce();
      expect(createPool).toHaveBeenCalledWith({
        host: "db.example",
        port: 3307,
        user: "user",
        password: "pass",
        database: "app",
        connectionLimit: 5,
      });
    } finally {
      vi.doUnmock("mysql2/promise");
      vi.resetModules();
    }
  });

  test("accepts mysql2:// connection strings", async () => {
    const createPool = vi.fn(() => mockPool(mockConnection()));
    vi.doMock("mysql2/promise", () => ({ createPool }));

    try {
      const { mysql2Adapter: adapterFactory } = await import("../src/mysql2.ts");
      const adapter = adapterFactory({
        connectionString: "mysql2://localhost/testdb",
        connectionOptions: {},
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
      vi.doUnmock("mysql2/promise");
      vi.resetModules();
    }
  });

  test("fails when connectionString protocol is invalid", async () => {
    const adapter = mysql2Adapter({
      connectionString: "postgres://localhost/db",
      connectionOptions: {},
    });
    const result = await adapter.check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "mysql2Adapter: invalid protocol in connection string: postgres. expeceted mysql:// or mysql2://",
    );
  });
});
