import { createRequire } from "node:module";
import { describe, expect, test, vi } from "vite-plus/test";
import type { ClientBase } from "pg";
import { Client, Pool } from "pg";
import { pgAdapter } from "../src/pg.ts";

// Exercise the minimum supported pg version with a separate module identity.
const { Client: LegacyClient, Pool: LegacyPool } = createRequire(import.meta.url)(
  "pg-legacy",
) as typeof import("pg");

describe("src/pg.ts", () => {
  test("runs default query on a direct client and returns ok with latency metadata", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query } as unknown as ClientBase;
    const adapter = pgAdapter({ client });
    const result = await adapter.check();
    expect(result.status).toBe("ok");
    expect(query).toHaveBeenCalledWith("SELECT 1");
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("uses custom query string", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query } as unknown as ClientBase;
    const adapter = pgAdapter({ client, query: "SELECT current_database()" });
    await adapter.check();
    expect(query).toHaveBeenCalledWith("SELECT current_database()");
  });

  test("connects via pool and releases client in finally", async () => {
    const inner = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
    const connect = vi.fn().mockResolvedValue(inner);
    const pool = Object.assign(new Pool(), { connect });
    const adapter = pgAdapter({ client: pool });
    const result = await adapter.check();
    expect(result.status).toBe("ok");
    expect(connect).toHaveBeenCalledOnce();
    expect(inner.release).toHaveBeenCalledOnce();
  });

  test("acquires and releases clients from pools without matching the local Pool class", async () => {
    const inner = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
    const pool = new LegacyPool();
    const connect = vi.spyOn(pool, "connect").mockImplementation(vi.fn().mockResolvedValue(inner));
    const query = vi.spyOn(pool, "query");
    const metadata = vi.fn(async (client: ClientBase) => {
      expect(client).toBe(inner);
      expect(inner.release).not.toHaveBeenCalled();
      return { role: "replica" };
    });
    const adapter = pgAdapter({ client: pool, metadata });

    expect(pool).not.toBeInstanceOf(Pool);
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({ role: "replica" });
    expect(connect).toHaveBeenCalledOnce();
    expect(query).not.toHaveBeenCalled();
    expect(inner.query).toHaveBeenCalledWith("SELECT 1");
    expect(metadata).toHaveBeenCalledOnce();
    expect(inner.release).toHaveBeenCalledOnce();
  });

  test.each([
    "direct client",
    "supplied pool client",
    "legacy direct client",
    "legacy supplied pool client",
    "direct client with totalCount",
    "supplied pool client with pool counters",
  ])("runs repeated checks on a connected %s without connecting or releasing it", async (kind) => {
    const release = vi.fn();
    const client = kind.startsWith("legacy") ? new LegacyClient() : new Client();
    if (kind.includes("pool client")) Object.assign(client, { release });
    if (kind.includes("totalCount")) Object.assign(client, { totalCount: 0 });
    if (kind.includes("pool counters")) {
      Object.assign(client, { totalCount: 0, idleCount: 0, waitingCount: 0 });
    }
    const connect = vi
      .spyOn(client, "connect")
      .mockRejectedValue(
        new Error("Client has already been connected. You cannot reuse a client."),
      );
    const query = vi
      .spyOn(client, "query")
      .mockImplementation(vi.fn().mockResolvedValue({ rows: [] }));
    const end = vi.spyOn(client, "end");
    const metadata = vi.fn(async (resolvedClient: ClientBase) => {
      expect(resolvedClient).toBe(client);
      return { role: "replica" };
    });
    const adapter = pgAdapter({ client, metadata });

    for (let i = 0; i < 2; i++) {
      const result = await adapter.check();
      expect(result.status).toBe("ok");
      expect(result.metadata).toMatchObject({ role: "replica" });
    }

    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledWith("SELECT 1");
    expect(metadata).toHaveBeenCalledTimes(2);
    expect(connect).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });

  test.each([
    { stage: "query", PoolClass: Pool },
    { stage: "metadata", PoolClass: Pool },
    { stage: "query", PoolClass: LegacyPool },
    { stage: "metadata", PoolClass: LegacyPool },
  ])("releases acquired pool clients when $stage fails", async ({ stage, PoolClass }) => {
    const error = new Error(`${stage} failed`);
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const metadata = vi.fn().mockResolvedValue({ role: "replica" });
    if (stage === "query") query.mockRejectedValue(error);
    else metadata.mockRejectedValue(error);
    const inner = { query, release: vi.fn() };
    const connect = vi.fn().mockResolvedValue(inner);
    const pool = Object.assign(new PoolClass(), { connect });

    const result = await pgAdapter({ client: pool, metadata }).check();

    expect(result.status).toBe("fail");
    expect(result.error).toBe(error);
    expect(connect).toHaveBeenCalledOnce();
    expect(inner.release).toHaveBeenCalledOnce();
  });

  test("returns fail when query rejects", async () => {
    const query = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const client = { query } as unknown as ClientBase;
    const adapter = pgAdapter({ client });
    const result = await adapter.check();
    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("ECONNREFUSED");
  });

  test("includes metadata from optional metadata hook", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query } as unknown as ClientBase;
    const adapter = pgAdapter({
      client,
      metadata: async (c) => {
        expect(c).toBe(client);
        return { role: "replica" };
      },
    });
    const result = await adapter.check();
    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({ role: "replica", latencyMs: expect.any(Number) });
  });
});
