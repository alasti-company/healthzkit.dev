import { httpAdapter } from "@healthzkit/http";
import { createFetchHandler, createHealthKit } from "healthzkit";
import { Hono } from "hono";

// Workers freeze the isolate between requests. Run checks on demand.
// Background scheduling belongs in a long-lived Node process. See apps/example-node.
const kit = createHealthKit({
  output: { exposeError: false, exposeMetadata: false },
  defaults: { timeout: 2_000 },
  checks: [
    {
      name: "process",
      type: ["liveness", "startup"],
      adapter: { check: async () => ({ status: "ok" }) },
    },
    {
      name: "upstream",
      type: ["readiness"],
      adapter: httpAdapter({ url: "https://example.com", timeout: 1_500 }),
    },
  ],
});

const app = new Hono();
const health = createFetchHandler(kit);

app.get("/", (c) => {
  const host = new URL(c.req.url).origin;
  const links = [
    { href: `${host}/healthz/startup`, label: "GET /healthz/startup" },
    { href: `${host}/healthz/live`, label: "GET /healthz/live" },
    { href: `${host}/healthz/ready`, label: "GET /healthz/ready" },
  ];
  const items = links
    .map((link) => `<li><a href="${link.href}">${link.label}</a></li>`)
    .join("\n    ");
  return c.html(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>healthzkit Workers example</title>
  </head>
  <body>
    <h1>healthzkit example endpoints</h1>
    <ul>
    ${items}
    </ul>
  </body>
</html>`);
});

app.all("/healthz/*", (c) => health(c.req.raw));

export { app };

export default {
  fetch: app.fetch,
};
