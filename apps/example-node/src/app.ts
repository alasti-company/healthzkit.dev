import { Hono } from "hono";
import { createHealthKit, toFetchResponse } from "healthzkit";
import { pgAdapter } from "@healthzkit/postgres/pg";
import type { Pool } from "pg";

export function createApplication(pool: Pool) {
  let draining = false;
  const kit = createHealthKit({
    output: { exposeError: false },
    defaults: { timeout: 2_000 },
    checks: [
      {
        name: "process",
        type: ["liveness"],
        adapter: { check: async () => ({ status: "ok" }) },
      },
      {
        name: "database",
        type: ["readiness"],
        adapter: pgAdapter({ client: pool }),
        schedule: { intervalMs: 5_000 },
      },
    ],
  });
  const app = new Hono();
  app.get("/healthz/live", async () => toFetchResponse(await kit.handleLiveness()));
  app.get("/healthz/ready", async (c) => {
    if (draining) return c.json({ status: "fail" }, 503);
    return toFetchResponse(await kit.handleReadiness());
  });
  // Application traffic shares the exact same pool as the readiness adapter.
  app.get("/", async (c) => {
    if (draining) return c.json({ error: "shutting down" }, 503);
    try {
      await pool.query("SELECT 1");
      return c.json({ message: "hello" });
    } catch {
      return c.json({ error: "service unavailable" }, 503);
    }
  });
  return {
    app,
    start: () => kit.start(),
    beginDrain: () => {
      draining = true;
      kit.stop();
    },
  };
}
