import { describe, expect, test, vi } from "vite-plus/test";
import type { Sql } from "postgres";
import { postgresJsAdapter } from "../src/postgres.ts";

describe("src/postgres.ts", () => {
  test("runs default query via unsafe and returns ok with latency metadata", async () => {
    const unsafe = vi.fn().mockResolvedValue(undefined);
    const sql = { unsafe } as unknown as Sql;
    const adapter = postgresJsAdapter({ client: sql });
    const result = await adapter.check();
    expect(result.status).toBe("ok");
    expect(unsafe).toHaveBeenCalledWith("SELECT 1");
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("uses custom query string", async () => {
    const unsafe = vi.fn().mockResolvedValue(undefined);
    const sql = { unsafe } as unknown as Sql;
    const adapter = postgresJsAdapter({ client: sql, query: "SELECT 2" });
    await adapter.check();
    expect(unsafe).toHaveBeenCalledWith("SELECT 2");
  });

  test("returns fail when unsafe rejects", async () => {
    const unsafe = vi.fn().mockRejectedValue(new Error("closed"));
    const sql = { unsafe } as unknown as Sql;
    const adapter = postgresJsAdapter({ client: sql });
    const result = await adapter.check();
    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("closed");
  });

  test("includes metadata from optional metadata hook", async () => {
    const unsafe = vi.fn().mockResolvedValue(undefined);
    const sql = { unsafe } as unknown as Sql;
    const adapter = postgresJsAdapter({
      client: sql,
      metadata: async (s) => {
        expect(s).toBe(sql);
        return { server: "local" };
      },
    });
    const result = await adapter.check();
    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({ server: "local", latencyMs: expect.any(Number) });
  });
});
