# healthzkit

Framework-agnostic **liveness** and **readiness** probes for Node.js. Define checks as small adapters; **healthzkit** runs them in parallel, rolls up overall status, maps that to HTTP status and a JSON or plain-text body, and optionally **schedules** checks in the background so probes can read cached results instead of hitting dependencies on every request.

Docs: [healthzkit.dev](https://healthzkit.dev)

```bash
npm install healthzkit hono @healthzkit/postgres pg
```

The package is ESM-only. Runtime: Node.js 22.12+ (CI). Other runtimes with `fetch` / `Response` work for the Fetch helper.

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

GET and HEAD are served on the live/ready routes; other methods on those routes return **405** with `Allow: GET, HEAD`. Unknown paths return **404**.

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

## Structured results and observability

`await kit.checkLiveness()` and `await kit.checkReadiness()` return a typed
`HealthResponse` (`status`, `timestamp`, `checks`) without HTTP serialization. They
use the same checks, deadlines, in-flight deduplication, cache, `treatAs`, and rollup
as the HTTP methods. HTTP status mapping and output filtering happen afterward.
Structured results and hook payloads retain errors and metadata even when
`output.exposeError` is false. Treat them as internal diagnostics.

Hooks need no telemetry dependency. For example, log executions and accumulate
counts/durations in memory for your metrics exporter:

```ts
const counts = new Map<string, number>();
const durations = new Map<string, number>();
const kit = createHealthKit({
  checks: [
    { name: "process", type: ["liveness"], adapter: { check: async () => ({ status: "ok" }) } },
  ],
  hooks: {
    onCheckComplete(event) {
      console.info("health check", event);
      const key = `${event.name}:${event.status}:${event.source}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      durations.set(key, (durations.get(key) ?? 0) + event.duration);
    },
    onStatusChange(event) {
      console.info(`${event.name}: ${event.previousStatus} -> ${event.status}`);
    },
  },
});
const result = await kit.checkLiveness(); // HealthResponse, not an HTTP response
console.info(result.status);
```

Both hooks receive the check `name`, configured probe `type` array, effective
`status` (after `treatAs`), execution `duration` in milliseconds, completion
`timestamp` (ISO), `result` (`CheckResult`), and `source`:

| Situation                                    | Hook behavior                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| On-demand execution                          | One completion with source `"on-demand"`                                                          |
| Initial/interval background execution        | One completion with source `"scheduled"`, even without probe traffic                              |
| Concurrent callers sharing an execution      | No additional events, including across probe types and structured/HTTP callers                    |
| Scheduling adopts an on-demand execution     | Keeps the original `"on-demand"` source; no additional event                                      |
| Cached reads, including stale-cache failures | No execution or transition event; use structured probe results to observe staleness               |
| Execution times out                          | One failure completion at the deadline; no additional event for repeated reads or late settlement |

`onStatusChange` additionally receives `previousStatus`. It tracks **per-check
execution status**, not aggregate probe status or custom rollup changes. The first
observation establishes the baseline; unchanged results emit only completion.
`stop()` resets the baseline and suppresses events from unfinished executions in
the stopped lifecycle. Restarting does not manufacture an event for reused work.

Callbacks are invoked in completion-then-transition order, receive separate cloned
payloads, and are not awaited. Synchronous exceptions and rejected promises are
ignored, so they cannot fail probes or stop scheduling. Keep synchronous callback
work short; enqueue expensive telemetry. Metadata that cannot be structured-cloned
is omitted from hook payloads, while the execution event still fires and structured
results retain the original metadata. Rollup functions always receive internal
diagnostics, including when HTTP error exposure is disabled.

## Routes and `basePath`

| Path               | Behavior                                        |
| ------------------ | ----------------------------------------------- |
| `{basePath}/live`  | Runs checks whose `type` includes `"liveness"`  |
| `{basePath}/ready` | Runs checks whose `type` includes `"readiness"` |

Default `basePath` is `/healthz`. Override with `basePath` in config (e.g. `/api/health` → `/api/health/live`).

## Checks and adapters

Each check is a `CheckConfig`:

- **`name`** — Key in the response `checks` object. Must be unique across all checks, including different probe types; duplicate names throw during construction. Check names and the checks list are captured at construction, so later changes to the original configuration do not change them.
- **`type`** — One or both of `"liveness"` and `"readiness"`. Only checks that include the probe type run for that probe. If none match, the response is still **200** with an empty `checks` object.
- **`adapter`** — Must implement `HealthAdapter`: `check(context?: CheckContext): Promise<AdapterResult>`.
- **`timeout`** — Per-check timeout in ms. Default is **5000**, unless overridden by `defaults.timeout`.
- **`schedule`** — Optional `{ intervalMs }`. When `kit.start()` has been called, the adapter runs on that interval and results are **cached** (see [Scheduling](#scheduling)).
- **`onFail`** — Optional `httpStatus`, `treatAs` (e.g. map `"fail"` to `"degraded"` for rollup and body while adjusting HTTP status rules).
- **`onDegraded`** — Optional `httpStatus` override when this check and the overall rollup are `"degraded"` (see [HTTP status](#http-status)).

`AdapterResult`:

- **`status`**: `"ok" | "degraded" | "fail"`.
- **`error`**: Optional `Error` or string (included in the serialized check unless `output.exposeError` is `false`).
- **`metadata`**: Optional object merged into the check result.

Thrown errors from `adapter.check()` are treated as **`fail`** with the error message retained internally and included in HTTP output when `exposeError` is true.

Official adapters (Postgres, Redis, Kafka, S3, Prisma, Drizzle, and more) live in [`@healthzkit/*` packages](https://healthzkit.dev).

## Deadlines and cancellation

Healthzkit calls `check(context?: CheckContext)`, where `context.signal` is an `AbortSignal` that aborts when the check deadline expires. Existing zero-argument adapters continue to work. You can pass the signal to an API that supports cancellation:

```ts
import type { HealthAdapter } from "healthzkit";

const adapter: HealthAdapter = {
  async check(context) {
    const response = await fetch("https://api.example/health", {
      signal: context?.signal,
    });
    return { status: response.ok ? "ok" : "fail" };
  },
};
```

A deadline bounds the health response; it does not forcibly cancel driver work. Adapters must use the signal with an API that supports cancellation. The HTTP adapter forwards it to `fetch`; database adapters may need driver-specific cancellation or client timeouts.

Within one kit, concurrent requests for the same check share one operation, including liveness and readiness requests. If it times out, later requests fail immediately until the underlying operation settles. A late result cannot turn that timeout into a success. After settlement, checks without an active scheduled cache start a fresh operation on the next request. Scheduled checks keep serving the cached result until a later interval refreshes it. Other checks and other kit instances run independently. Stopping or restarting scheduling does not release pending adapter work.

## Timing configuration

`timeout`, `defaults.timeout`, and `schedule.intervalMs` must be integer milliseconds from **1** to **2,147,483,647** (the timer limit), inclusive. `createHealthKit()` and `new HealthKit()` throw a `RangeError` during construction for invalid values, with the field and check name where applicable. Defaults are validated even when overridden by every check.

Zero does **not** disable timeouts or scheduling; it is rejected along with negative, fractional, non-finite, and oversized values instead of relying on runtime timer coercion. Omit `timeout` to inherit `defaults.timeout` or **5,000ms**; omit `schedule` to run on demand. Timing settings are captured at construction, so mutating the original defaults or schedule afterward does not change them.

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

Scheduled runs use the check's **`timeout`**, then **`defaults.timeout`**, then **5,000ms**. A timeout replaces the cached result with a failure. Refreshes do not overlap: if an adapter remains pending after its timeout, later intervals skip it until it settles. A late result cannot overwrite the timeout failure.

A cached result becomes a failure when its age reaches **`intervalMs + timeout`**. This allows one interval plus the refresh timeout before a result becomes stale. Failures follow your configured `onFail` behavior. While the initial scheduled check is pending, probes await that same check and share its result or timeout. When scheduling is inactive and there is no cached result, probes run the check on demand with the same timeout.

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
- Else if rollup is **`degraded`**: the first check in config order with **`status === "degraded"`** and **`onDegraded.httpStatus`** set wins. If none matches, use `defaults.onDegraded.httpStatus` or **200**. A degraded override never takes precedence over a failed rollup.
- Else **200**.

Note: `onFail.treatAs` changes the **check** status before HTTP mapping. A failure remapped to `"degraded"` uses `onDegraded.httpStatus` / degraded defaults, not `onFail.httpStatus`. Custom rollups to `"ok"` or `"fail"` do not use degraded overrides.

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
- `HealthKit`: `start()`, `stop()`, `checkLiveness()`, `checkReadiness()`, `handleRequest(req)`, `handleLiveness()`, `handleReadiness()`
- `toFetchResponse(res, method?)` → Fetch `Response` (`HEAD` omits the body)
- `createFetchHandler(kit)` → `(request: Request) => Promise<Response>`

**Types**

- `HealthkitConfig`, `CheckConfig`, `CheckContext`, `HealthAdapter`, `AdapterResult`, `CheckResult`, `HealthResponse`
- `CheckStatus`, `CheckType`, `RollupConfig`, `OutputConfig`, `DefaultsConfig`
- `AgnosticRequest`, `AgnosticResponse`
- `ObservabilityHooks`, `CheckCompleteEvent`, `StatusChangeEvent`

`AgnosticResponse` is `{ status: number; headers: Record<string, string>; body: string }` so you can map it to Express, Fastify, `fetch` `Response`, etc.

## Development (this repo)

From the package directory:

```bash
vp install
vp test
vp pack
```

See the repo root `AGENTS.md` for Vite+ / `vp` conventions.
