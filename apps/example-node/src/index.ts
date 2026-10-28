import { serve } from "@hono/node-server";
import { Pool } from "pg";
import { createApplication } from "./app.ts";
import { createShutdown } from "./shutdown.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");

// The application owns this pool. The adapter only borrows/releases its clients.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 1_000,
  query_timeout: 1_500,
  statement_timeout: 1_500,
});
// Avoid unhandled idle-client errors; never print connection strings or driver errors.
pool.on("error", () => console.error("Postgres idle connection failed"));
const application = createApplication(pool);
application.start();
const server = serve({ fetch: application.app.fetch, port, hostname: "0.0.0.0" });
const shutdown = createShutdown({
  beginDrain: application.beginDrain,
  closeServer: () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  closePool: () => pool.end(),
  drainMs: 5_000,
  deadlineMs: 25_000,
  forceExit: () => {
    console.error("Shutdown deadline exceeded");
    process.exit(1);
  },
});
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void shutdown().catch(() => {
      console.error("Shutdown failed");
      process.exit(1);
    });
  });
}
