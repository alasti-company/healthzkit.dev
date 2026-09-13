---
title: Getting started
description: Install healthzkit, copy a Hono or Fetch handler, and point Kubernetes at /healthz/live and /healthz/ready.
---

# Getting started

## Hono (copy-paste)

```bash
npm install healthzkit hono
```

```ts
import { Hono } from "hono";
import { createHealthKit, toFetchResponse } from "healthzkit";

const kit = createHealthKit({
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
        check: async () => {
          // ping your database, or use @healthzkit/postgres, drizzle, prisma, …
          return { status: "ok" };
        },
      },
    },
  ],
});

const app = new Hono();
app.get("/healthz/live", async () => toFetchResponse(await kit.handleLiveness()));
app.get("/healthz/ready", async () => toFetchResponse(await kit.handleReadiness()));

export default app;
```

Point a liveness probe at `GET /healthz/live` and a readiness probe at `GET /healthz/ready`.

## Fetch-API servers (Bun, Deno, Workers)

```bash
npm install healthzkit
```

```ts
import { createFetchHandler, createHealthKit } from "healthzkit";

const kit = createHealthKit({
  checks: [
    { name: "process", type: ["liveness"], adapter: { check: async () => ({ status: "ok" }) } },
  ],
});

const handler = createFetchHandler(kit);
```

`createFetchHandler` answers `{basePath}/live` and `{basePath}/ready` (default `/healthz`) on GET and HEAD. Other methods return 405. Unknown paths return 404.

## `handleRequest`

If you already route HTTP yourself, pass the incoming path:

```ts
const res = await kit.handleRequest({ path: "/healthz/ready", method: "GET" });
if (res) {
  // res.status, res.headers, res.body
}
```

## Default routes and `basePath`

By default, healthzkit expects:

| Path               | Behavior                                        |
| ------------------ | ----------------------------------------------- |
| `{basePath}/live`  | Runs checks whose `type` includes `"liveness"`  |
| `{basePath}/ready` | Runs checks whose `type` includes `"readiness"` |

The default `basePath` is `/healthz`. Set `basePath` in the root config to move both routes (for example `/api/health` → `/api/health/live` and `/api/health/ready`).

`handleRequest(req)` returns `null` when `req.path` does not match either route, so you can try it first and fall through to the rest of your application.

## `AgnosticResponse`

Handlers resolve to `AgnosticResponse`:

```ts
interface AgnosticResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
```

Map `status`, `headers`, and `body` onto your framework’s response object, or call `toFetchResponse(res)` for Hono, Next.js, Bun, and Workers.
