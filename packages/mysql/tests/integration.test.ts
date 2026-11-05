import { createPool } from "mysql2/promise";
import { describe, expect, it } from "vite-plus/test";
import { refusedPort, serviceUrl } from "../../../tools/shared/test-support/integration.ts";
import { mysql2Adapter } from "../src/mysql2.ts";

describe.skipIf(process.env.HEALTHZKIT_INTEGRATION !== "1")(
  "mysql2 real-service integration",
  () => {
    it("releases a one-connection pool after repeated probes and SQL errors", async () => {
      const pool = createPool({
        uri: serviceUrl("MYSQL"),
        connectionLimit: 1,
        waitForConnections: false,
        connectTimeout: 1_000,
      });
      pool.pool.on("connection", (connection) => {
        connection.query(
          { sql: "SET SESSION MAX_EXECUTION_TIME=1000", timeout: 1_000 },
          (error) => {
            if (error) connection.destroy();
          },
        );
      });
      try {
        const adapter = mysql2Adapter({ client: pool });
        for (let index = 0; index < 5; index++) {
          expect((await adapter.check()).status).toBe("ok");
        }
        const failed = await mysql2Adapter({
          client: pool,
          query: "SELECT healthzkit_missing_column",
        }).check();
        expect(failed.status).toBe("fail");
        expect(failed.error).toMatchObject({ code: "ER_BAD_FIELD_ERROR" });
        expect((await adapter.check()).status).toBe("ok");
        await pool.query({ sql: "SELECT 1", timeout: 1_000 });
      } finally {
        await pool.end();
      }
    }, 15_000);

    it("reports repeated refused connections and lets the owner close the pool", async () => {
      const pool = createPool({
        host: "127.0.0.1",
        port: await refusedPort(),
        user: "healthzkit",
        connectTimeout: 1_000,
        connectionLimit: 1,
        waitForConnections: false,
      });
      try {
        const adapter = mysql2Adapter({ client: pool });
        for (let index = 0; index < 3; index++) {
          const result = await adapter.check();
          expect(result.status).toBe("fail");
          expect(result.error).toBeTruthy();
        }
      } finally {
        await pool.end();
      }
    }, 15_000);
  },
);
