# healthzkit

Framework-agnostic **liveness** and **readiness** probes for Node.js. Define checks as small adapters; **healthzkit** runs them in parallel, rolls up overall status, maps that to HTTP status and a JSON or plain-text body, and optionally **schedules** checks in the background so probes can read cached results instead of hitting dependencies on every request.

Docs: [healthzkit.dev](https://healthzkit.dev)

```bash
npm install healthzkit
```

The package is ESM-only. Runtime: Node.js 18+ (and other runtimes with `fetch` / `Response` if you use the Fetch helper).

## Quick start (Hono)

```ts
import { Hono } from "hono";
import { createHealthKit, toFetchResponse } from "healthzkit";
import { pgAdapter } from "@healthzkit/postgres/pg";

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
      adapter: pgAdapter({ connectionString: process.env.DATABASE_URL! }),
      schedule: { intervalMs: 30_000 },
    },
  ],
});

kit.start();

const app = new Hono();
app.get("/healthz/live", async () => toFetchResponse(await kit.handleLiveness()));
app.get("/healthz/ready", async () => toFetchResponse(await kit.handleReadiness()));

export default app;
```

Point Kubernetes (or any orchestrator) at `GET /healthz/live` and `GET /healthz/ready`. A failed readiness check returns **503** by default so the instance is taken out of rotation.

## Fetch, Next.js, Bun, Workers

`createFetchHandler` mounts the default routes on any Fetch-API server:

```ts
import { createFetchHandler, createHealthKit } from "healthzkit";

const kit = createHealthKit({
  checks: [
    { name: "process", type: ["liveness"], adapter: { check: async () => ({ status: "ok" }) } },
  ],
});

const handler = createFetchHandler(kit);

Deno.serve(handler); // also: Bun.serve({ fetch: handler })
```

```ts
// app/healthz/live/route.ts  (Next.js App Router)
import { createHealthKit, toFetchResponse } from "healthzkit";

const kit = createHealthKit({
  checks: [
    {
      name: "process",
      type: ["liveness", "readiness"],
      adapter: { check: async () => ({ status: "ok" }) },
    },
  ],
});

export const dynamic = "force-dynamic";
export const GET = async () => toFetchResponse(await kit.handleLiveness());
export const HEAD = async () => toFetchResponse(await kit.handleLiveness(), "HEAD");
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
```

More frameworks: [healthzkit.dev/guide/frameworks](https://healthzkit.dev/guide/frameworks).

## `handleRequest`

If you already have a router, pass the incoming path:

```ts
const res = await kit.handleRequest({ path: "/healthz/ready", method: "GET" });
if (res) {
  // res.status, res.headers, res.body
}
```

`handleRequest` returns `null` when the path is not a probe route, so you can try it first and fall through.

## Routes and `basePath`

| Path               | Behavior                                        |
| ------------------ | ----------------------------------------------- |
| `{basePath}/live`  | Runs checks whose `type` includes `"liveness"`  |
| `{basePath}/ready` | Runs checks whose `type` includes `"readiness"` |

Default `basePath` is `/healthz`. Override with `basePath` in config (e.g. `/api/health` → `/api/health/live`).

## Checks and adapters

Each check is a `CheckConfig`:

- **`name`** — Key in the response `checks` object.
- **`type`** — One or both of `"liveness"` and `"readiness"`. Only checks that include the probe type run for that probe. If none match, the response is still **200** with an empty `checks` object.
- **`adapter`** — Must implement `HealthAdapter`: `check(): Promise<AdapterResult>`.
- **`timeout`** — Per-check timeout in ms. Default is **5000**, unless overridden by `defaults.timeout`.
- **`schedule`** — Optional `{ intervalMs }`. When `kit.start()` has been called, the adapter runs on that interval and results are **cached** (see [Scheduling](#scheduling)).
- **`onFail`** — Optional `httpStatus`, `treatAs` (e.g. map `"fail"` to `"degraded"` for rollup and body while adjusting HTTP status rules).
- **`onDegraded`** — Optional on `CheckConfig` in the type definition only; degraded HTTP status is set via **`defaults.onDegraded`** (see [HTTP status](#http-status)).

`AdapterResult`:

- **`status`**: `"ok" | "degraded" | "fail"`.
- **`error`**: Optional `Error` or string (included in the serialized check unless `output.exposeError` is `false`).
- **`metadata`**: Optional object merged into the check result.

Thrown errors from `adapter.check()` are treated as **`fail`** with the error message captured when `exposeError` is true.

Official adapters (Postgres, Redis, Kafka, S3, Prisma, Drizzle, and more) live in [`@healthzkit/*` packages](https://healthzkit.dev).

## Scheduling

For expensive checks (database, external APIs), run them on a timer and serve probes from cache:

```ts
const kit = createHealthKit({
  checks: [
    {
      name: "db",
      type: ["readiness"],
      adapter: { check: async () => ({ status: "ok" }) },
      schedule: { intervalMs: 30_000 },
    },
  ],
});

kit.start(); // starts background intervals for checks that define schedule
// ... on shutdown:
kit.stop();
```

- **`start()`** is idempotent (second call is a no-op).
- **`stop()`** clears intervals and the cache.
- When a cached result is used, that check’s **`latency`** is **0** and **`cachedAt`** is an ISO timestamp on the check result.

Scheduled runs use **`adapter.check()`** directly (no per-request timeout wrapper in the scheduler). Timeouts still apply when there is **no** cache entry and the probe executes the check on demand.

Timers use `unref` when available so they do not keep the process alive by themselves.

## Rollup status

Overall `HealthResponse.status` is computed from all check results for that probe:

1. Any **`fail`** → **`fail`** (unless remapped by `onFail.treatAs` on that check).
2. Else any **`degraded`** → **`degraded`**.
3. Else **`ok`**.

Override with `rollup.computeStatus(results)` for custom rules.

## HTTP status

Response **`status`** (HTTP code) is derived from the rolled-up health status and your config:

- Any check with **`status === "fail"`** and **`onFail.httpStatus`** set → that value is returned (first matching check in config order wins among failed checks with a custom status).
- Else if rollup is **`fail`**: `defaults.onFail.httpStatus` or **503**.
- Else if rollup is **`degraded`**: `defaults.onDegraded.httpStatus` or **200**.
- Else **200**.

Note: `onFail.treatAs` changes the **check** status used for rollup and JSON/text body; combine with `onFail.httpStatus` / defaults if you need a specific HTTP code.

## Output

`output` on the root config:

- **`format`**: `"json"` (default) or `"text"`.
  - JSON: `Content-Type: application/json`, body is `JSON.stringify` of `HealthResponse`.
  - Text: `Content-Type: text/plain`, human-readable lines (`status:`, then each check with latency and optional error).
- **`exposeError`**: Default **true**. If **false**, the `error` field is omitted from each check in the payload.

## Types (public API)

Exported from `healthzkit`:

**Runtime**

- `createHealthKit(config)` → `HealthKit`
- `HealthKit`: `start()`, `stop()`, `handleRequest(req)`, `handleLiveness()`, `handleReadiness()`
- `toFetchResponse(res, method?)` → Fetch `Response` (`HEAD` omits the body)
- `createFetchHandler(kit)` → `(request: Request) => Promise<Response>`

**Types**

- `HealthkitConfig`, `CheckConfig`, `HealthAdapter`, `AdapterResult`, `CheckResult`, `HealthResponse`
- `CheckStatus`, `CheckType`, `RollupConfig`, `OutputConfig`, `DefaultsConfig`
- `AgnosticRequest`, `AgnosticResponse`

`AgnosticResponse` is `{ status: number; headers: Record<string, string>; body: string }` so you can map it to Express, Fastify, `fetch` `Response`, etc.

## Development (this repo)

From the package directory:

```bash
vp install
vp test
vp pack
```

See the repo root `AGENTS.md` for Vite+ / `vp` conventions.
