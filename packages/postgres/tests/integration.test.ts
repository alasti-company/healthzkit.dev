import { createServer } from "node:net";
import { Pool } from "pg";
import { describe, expect, it } from "vite-plus/test";
import { pgAdapter } from "../src/pg.ts";

const integration = process.env.HEALTHZKIT_INTEGRATION === "1";
const connectionString = process.env.HEALTHZKIT_POSTGRES_URL;

describe.skipIf(!integration)("pg real-service integration", () => {
  it("reuses a pool, releases successful and failed queries, and lets the owner close it", async () => {
    if (!connectionString) throw new Error("Set HEALTHZKIT_POSTGRES_URL for integration tests");
    const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 1_000 });
    try {
      const adapter = pgAdapter({ client: pool });
      for (let index = 0; index < 10; index++) {
        expect((await adapter.check()).status).toBe("ok");
        expect(pool.totalCount).toBe(1);
        expect(pool.idleCount).toBe(1);
        expect(pool.waitingCount).toBe(0);
      }
      const failing = pgAdapter({ client: pool, query: "SELECT healthzkit_missing_column" });
      expect((await failing.check()).status).toBe("fail");
      expect(pool.idleCount).toBe(1);
      expect((await adapter.check()).status).toBe("ok");
    } finally {
      await pool.end();
    }
    expect(pool.totalCount).toBe(0);
  });

  it("reports an unavailable service and does not retain failed connections", async () => {
    // Reserve an ephemeral loopback port, then close it rather than assuming a fixed port is unused.
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP address");
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    const pool = new Pool({
      host: "127.0.0.1",
      port: address.port,
      user: "healthzkit",
      database: "healthzkit",
      connectionTimeoutMillis: 1_000,
    });
    try {
      const adapter = pgAdapter({ client: pool });
      for (let index = 0; index < 3; index++) {
        const result = await adapter.check();
        expect(result.status).toBe("fail");
        expect(result.error).toBeTruthy();
        expect(pool.totalCount).toBe(0);
        expect(pool.waitingCount).toBe(0);
      }
    } finally {
      await pool.end();
    }
  });
});
