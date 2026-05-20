# Framework guides

Use these examples to wire healthzkit into common runtimes. Each snippet maps `AgnosticResponse` (`status`, `headers`, `body`) to the framework response object.

## Bun + Elysia (scheduled Postgres check)

```ts
import { createHealthKit } from "healthzkit";
import { Elysia } from "elysia";
import { pgAdapter } from "@healthzkit/postgres/pg";
import { env } from "../env";

export const kit = createHealthKit({
  checks: [
    {
      name: "database",
      type: ["readiness"],
      adapter: pgAdapter({
        connectionString: env.DATABASE_URL,
      }),
      schedule: { intervalMs: 60_000 },
    },
  ],
});

kit.start();

const healthRoutes = new Elysia({ prefix: "/healthz", tags: ["Healthzkit"] })
  .get("/live", async ({ set }) => {
    const res = await kit.handleLiveness();
    set.status = res.status;
    for (const [key, value] of Object.entries(res.headers)) set.headers[key] = value;
    return res.body;
  })
  .get("/ready", async ({ set }) => {
    const res = await kit.handleReadiness();
    set.status = res.status;
    for (const [key, value] of Object.entries(res.headers)) set.headers[key] = value;
    return res.body;
  });

const app = new Elysia().use(healthRoutes).listen(8000);

process.on("SIGINT", async () => {
  kit.stop();
  await app.stop();
  process.exit(0);
});
```

## Express

```ts
import express from "express";
import { createHealthKit } from "healthzkit";

const kit = createHealthKit({
  checks: [
    {
      name: "process",
      type: ["liveness", "readiness"],
      adapter: { check: async () => ({ status: "ok" }) },
    },
  ],
});

const app = express();

app.get("/healthz/live", async (_req, res) => {
  const out = await kit.handleLiveness();
  res.status(out.status).set(out.headers).send(out.body);
});

app.get("/healthz/ready", async (_req, res) => {
  const out = await kit.handleReadiness();
  res.status(out.status).set(out.headers).send(out.body);
});

const server = app.listen(3000);

process.on("SIGTERM", () => {
  kit.stop();
  server.close();
});
```

## Hono

```ts
import { Hono } from "hono";
import { createHealthKit } from "healthzkit";

const kit = createHealthKit({
  checks: [
    {
      name: "process",
      type: ["liveness", "readiness"],
      adapter: { check: async () => ({ status: "ok" }) },
    },
  ],
});

const app = new Hono();

app.get("/healthz/live", async () => {
  const out = await kit.handleLiveness();
  return new Response(out.body, { status: out.status, headers: out.headers });
});

app.get("/healthz/ready", async () => {
  const out = await kit.handleReadiness();
  return new Response(out.body, { status: out.status, headers: out.headers });
});

export default app;
```

## Next.js (App Router)

For serverless deployments, skip `kit.start()` and run checks on demand. If you run Next.js in a long-lived Node process, you can enable scheduling with `kit.start()` in process bootstrap code and `kit.stop()` on shutdown.

```ts
// app/healthz/live/route.ts
import { createHealthKit } from "healthzkit";

export const kit = createHealthKit({
  checks: [
    {
      name: "process",
      type: ["liveness", "readiness"],
      adapter: { check: async () => ({ status: "ok" }) },
    },
  ],
});

export async function GET() {
  const out = await kit.handleLiveness();
  return new Response(out.body, { status: out.status, headers: out.headers });
}
```

```ts
// app/healthz/ready/route.ts
import { kit } from "../live/route";

export async function GET() {
  const out = await kit.handleReadiness();
  return new Response(out.body, { status: out.status, headers: out.headers });
}
```

## Node HTTP / fetch-style runtimes

```ts
import http from "node:http";
import { createHealthKit } from "healthzkit";

const kit = createHealthKit({
  checks: [
    { name: "process", type: ["liveness"], adapter: { check: async () => ({ status: "ok" }) } },
  ],
});

const server = http.createServer(async (req, res) => {
  const out = await kit.handleRequest({
    method: req.method ?? "GET",
    path: req.url ?? "/",
  });

  if (!out) {
    res.statusCode = 404;
    res.end("not found");
    return;
  }

  res.writeHead(out.status, out.headers);
  res.end(out.body);
});

server.listen(3000);
```
