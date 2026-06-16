import { describe, expect, test, vi } from "vite-plus/test";
import type { ClientBase } from "pg";
import { Pool } from "pg";
import { cockroachPgAdapter } from "../src/pg.ts";

describe("src/pg.ts", () => {
  test("runs default query on a direct client and returns ok with latency metadata", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query } as unknown as ClientBase;
    const adapter = cockroachPgAdapter({ client });
    const result = await adapter.check();
    expect(result.status).toBe("ok");
    expect(query).toHaveBeenCalledWith("SELECT 1");
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("uses custom query string", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query } as unknown as ClientBase;
    const adapter = cockroachPgAdapter({ client, query: "SELECT current_database()" });
    await adapter.check();
    expect(query).toHaveBeenCalledWith("SELECT current_database()");
  });

  test("connects via pool and releases client in finally", async () => {
    const inner = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
    const connect = vi.fn().mockResolvedValue(inner);
    const pool = Object.assign(Object.create(Pool.prototype), { connect }) as Pool;
    const adapter = cockroachPgAdapter({ client: pool });
    const result = await adapter.check();
    expect(result.status).toBe("ok");
    expect(connect).toHaveBeenCalledOnce();
    expect(inner.release).toHaveBeenCalledOnce();
  });

  test("returns fail when query rejects", async () => {
    const query = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const client = { query } as unknown as ClientBase;
    const adapter = cockroachPgAdapter({ client });
    const result = await adapter.check();
    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("ECONNREFUSED");
  });

  test("includes metadata from optional metadata hook", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query } as unknown as ClientBase;
    const adapter = cockroachPgAdapter({
      client,
      metadata: async (c) => {
        expect(c).toBe(client);
        return { cluster: "regional" };
      },
    });
    const result = await adapter.check();
    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({ cluster: "regional", latencyMs: expect.any(Number) });
  });
});
