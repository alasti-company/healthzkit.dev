---
title: Getting started
description: Create a health kit, attach checks, and wire Healthzkit into your HTTP server.
---

# Getting started

## Minimal example

```ts
import { createHealthKit } from "healthzkit";

const kit = createHealthKit({
  checks: [
    {
      name: "db",
      type: ["readiness"],
      adapter: {
        check: async () => {
          // ping your database, etc.
          return { status: "ok" };
        },
      },
    },
    {
      name: "process",
      type: ["liveness"],
      adapter: { check: async () => ({ status: "ok" }) },
    },
  ],
});

// From your HTTP layer: path + method from the incoming request
const res = await kit.handleRequest({ path: "/healthz/ready", method: "GET" });
if (res) {
  // res.status, res.headers, res.body
}
```

If you already route liveness and readiness yourself, call `kit.handleLiveness()` or `kit.handleReadiness()` directly instead of `handleRequest`.

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

Map `status`, `headers`, and `body` onto your framework’s response object (Express `res`, Fastify `reply`, `new Response(body, { status, headers })`, and so on).
