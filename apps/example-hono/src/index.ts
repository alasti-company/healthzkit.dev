import { createFetchHandler, createHealthKit, toFetchResponse } from "healthzkit";
import type { Context } from "hono";
import { Hono } from "hono";

/** On-demand checks on every request; wired with `handleLiveness` / `handleReadiness`. */
const manualKit = createHealthKit({
  basePath: "/healthz",
  checks: [
    {
      name: "process",
      type: ["liveness"],
      adapter: { check: async () => ({ status: "ok" }) },
    },
    {
      name: "db",
      type: ["readiness"],
      adapter: {
        check: async () => ({
          status: "ok",
          metadata: { probe: "manual (runs each request)" },
        }),
      },
    },
  ],
});

/** Readiness check is scheduled; probes read cache when available (`handleRequest`). */
const scheduledKit = createHealthKit({
  basePath: "/api/healthz",
  checks: [
    {
      name: "process",
      type: ["liveness"],
      adapter: { check: async () => ({ status: "ok" }) },
    },
    {
      name: "db",
      type: ["readiness"],
      adapter: {
        check: async () => ({
          status: "ok",
          metadata: { probe: "scheduled background cache" },
        }),
      },
      schedule: { intervalMs: 15_000 },
    },
  ],
});

/** Workers forbid `setInterval` at module load; start the scheduler on first probe request. */
let scheduledKitStarted = false;
function ensureScheduledKitStarted(): void {
  if (scheduledKitStarted) return;
  scheduledKitStarted = true;
  scheduledKit.start();
}

const app = new Hono();

app.get("/", (c) => {
  const host = new URL(c.req.url).origin;
  const links = [
    { href: `${host}/healthz/live`, label: "GET /healthz/live (manual liveness)" },
    { href: `${host}/healthz/ready`, label: "GET /healthz/ready (manual readiness)" },
    { href: `${host}/api/healthz/live`, label: "GET /api/healthz/live (scheduled kit, liveness)" },
    {
      href: `${host}/api/healthz/ready`,
      label: "GET /api/healthz/ready (scheduled kit, readiness)",
    },
  ];
  const items = links.map((l) => `<li><a href="${l.href}">${l.label}</a></li>`).join("\n    ");
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>healthzkit Hono example</title>
  </head>
  <body>
    <h1>healthzkit example endpoints</h1>
    <ul>
    ${items}
    </ul>
  </body>
</html>`;
  return c.html(html);
});

app.get("/healthz/live", async () => toFetchResponse(await manualKit.handleLiveness()));

app.get("/healthz/ready", async () => toFetchResponse(await manualKit.handleReadiness()));

const scheduledFetch = createFetchHandler(scheduledKit);

const handleScheduledHealthz = async (c: Context) => {
  ensureScheduledKitStarted();
  return scheduledFetch(c.req.raw);
};

app.get("/api/healthz/live", handleScheduledHealthz);
app.get("/api/healthz/ready", handleScheduledHealthz);

export default {
  fetch: app.fetch,
};
