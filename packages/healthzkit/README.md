# healthzkit

Framework-agnostic **liveness**, **readiness**, and **startup** probes for Node.js. Define checks as small adapters; **healthzkit** runs them in parallel, rolls up overall status, maps that to HTTP status and a JSON or plain-text body, and optionally **schedules** checks in the background so probes can read cached results instead of hitting dependencies on every request.

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
      type: ["liveness", "startup"],
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
app.get("/healthz/startup", async () => toFetchResponse(await kit.handleStartup()));

export default app;
```

Point Kubernetes (or any orchestrator) at `GET /healthz/live`, `GET /healthz/ready`, and `GET /healthz/startup`. A failed readiness check returns **503** by default so the instance is taken out of rotation.

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

| Path                 | Behavior                                        |
| -------------------- | ----------------------------------------------- |
| `{basePath}/live`    | Runs checks whose `type` includes `"liveness"`  |
| `{basePath}/ready`   | Runs checks whose `type` includes `"readiness"` |
| `{basePath}/startup` | Runs checks whose `type` includes `"startup"`   |

Default `basePath` is `/healthz`. Override with `basePath` in config (e.g. `/api/health` → `/api/health/live`).

## Checks and adapters

Each check is a `CheckConfig`:

- **`name`** — Key in the response `checks` object. Must be unique across all checks, including different probe types; duplicate names throw during construction. Check names and the checks list are captured at construction, so later changes to the original configuration do not change them.
- **`type`** — One or more of `"liveness"`, `"readiness"`, and `"startup"`. Only checks that include the probe type run for that probe. With the default rollup, no matching checks returns **200** with empty `checks`; a custom rollup still determines the status.
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
await kit.close();
```

- **`start()`** is idempotent (second call is a no-op).
- **`stop()`** clears intervals and the cache.
- When a cached result is used, that check’s **`latency`** is **0** and **`cachedAt`** is an ISO timestamp on the check result.

Scheduled runs use the check's **`timeout`**, then **`defaults.timeout`**, then **5,000ms**. A timeout replaces the cached result with a failure. Refreshes do not overlap: if an adapter remains pending after its timeout, later intervals skip it until it settles. A late result cannot overwrite the timeout failure.

A cached result becomes a failure when its age reaches **`intervalMs + timeout`**. This allows one interval plus the refresh timeout before a result becomes stale. Failures follow your configured `onFail` behavior. While the initial scheduled check is pending, probes await that same check and share its result or timeout. When scheduling is inactive and there is no cached result, probes run the check on demand with the same timeout.

Timers use `unref` when available so they do not keep the process alive by themselves.

## Startup and draining

```ts
let initialized = false;
const kit = createHealthKit({
  checks: [
    {
      name: "initialization",
      type: ["startup"],
      adapter: { check: async () => ({ status: initialized ? "ok" : "fail" }) },
    },
  ],
});
// Set initialized from your application initialization code.
// Serve kit.handleStartup() directly or mount createFetchHandler(kit).
// During your application's shutdown handler:
kit.beginDrain();
kit.stop();
```

Set `initialized` to `true` when initialization finishes. Startup checks use the same timeout, cache, rollup, and HTTP rules as other checks. Pending startup work is awaited until it settles or times out. Success is not latched: later probes re-evaluate on demand or read the scheduled cache. Kubernetes stops invoking its startup probe after success. With no startup checks, startup returns 200 with empty checks. Startup does not automatically gate readiness; include a check in both types if needed.

`beginDrain()` permanently puts this instance into draining state. Every new readiness request immediately returns **503**, with health status `fail` and empty `checks`, even if cached checks are healthy or custom rollup/HTTP settings would return success. Pending readiness requests also fail when their checks finish. Draining does not cancel pending work, stop scheduling, or change startup/liveness evaluation. Liveness can still fail independently. Both JSON and text output keep their configured format.

Repeated `beginDrain()`, `start()`, and `stop()` calls are safe. `stop()` only stops scheduling and clears its cache; on-demand checks remain usable. `start()` can restart scheduling after `stop()`, but neither resets drain state. Create a new kit for a new application lifecycle. No signal handlers or resource cleanup are installed: your application owns shutdown and adapter resources.

`handleRequest()` recognizes exact live, ready, and startup paths, accepts GET (also when method is omitted) and HEAD, and returns 405 with `Allow: GET, HEAD` for other methods on recognized paths. HEAD runs the same checks but omits the response body. Unknown paths return `null`. `createFetchHandler()` also strips URL query strings and returns 404 for unknown paths.

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
- `HealthKit`: `start()`, `stop()`, `close(): Promise<void>`, `beginDrain()`, `checkLiveness()`, `checkReadiness()`, `checkStartup()`, `handleRequest(req)`, `handleLiveness()`, `handleReadiness()`, `handleStartup()`

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

## Shutdown and disposal

```ts
// First stop accepting traffic and drain your application's requests.
// Then release resources created by health adapters:
await kit.close();
```

`stop()` only stops scheduling and clears cached results. You can restart scheduling or run checks on demand afterward. It does not dispose adapters. `close()` is terminal and immediately stops scheduling; every call returns the same promise, including after a cleanup failure.

Close waits for requests already accepted by the kit and for the underlying scheduled and on-demand adapter operations to settle. A check's response timeout does not end its underlying work. Close does not abort that work early or impose a shutdown deadline, so an adapter that never settles can keep close pending. Drain application traffic separately before closing.

Once close begins, `start()` throws `Error("HealthKit is closed")`. `handleLiveness()`, `handleReadiness()`, and matching `handleRequest()` calls reject with that error. Unmatched paths still return `null`; path matching remains available. Requests accepted before close retain their normal timeout and result handling; a pending scheduled result can report that scheduling was stopped.

Close calls each distinct adapter object's optional `dispose()` hook once, after pending work settles. Check-only custom adapters remain valid. All cleanup hooks are attempted even if another hook fails. Close rejects with an `AggregateError` whose `errors` array contains cleanup failures in adapter configuration order. Repeated close calls retain that rejection and do not retry cleanup. Check failures are reported through health responses, not added to cleanup errors.

Official adapters dispose only resources they create. Supplied clients, pools, connections, and their agents remain yours to close. Persistent drivers use their `end`, `close`, `quit`, `disconnect`, or `destroy` API as appropriate; checked-out pool connections are released before pool cleanup. AWS SDK v3 clients use `destroy()`. When you pass `config` to an AWS SDK v3 adapter, disposal calls `destroy()` on the constructed client, including its request handler and any agents owned by that handler. Passing `config.requestHandler` (including handler options with custom agents) transfers their shutdown lifecycle to that client. To retain ownership of a shared handler or agent, construct the AWS client yourself and pass `client`; the adapter never destroys supplied clients. KafkaJS checks run serially and disconnect their admin after each check. Later checks retry failed disconnects before creating another admin, returning a failed result while cleanup remains blocked. Disposal retries retained failures and reports any remaining errors. HTTP-based Upstash, AWS SDK v2, and MinIO clients have no client disposal API here; caller-provided HTTP agents remain caller-owned.

For official adapters that expose `dispose()`, direct users can call `await adapter.dispose?.()` for terminal, idempotent disposal that waits for active checks. Later direct checks return a failure without opening resources. Do not reuse a disposed adapter in another kit. Share an adapter across checks in the same kit only when those checks should share its resource lifetime.

For custom adapters, implement `dispose(): void | Promise<void>` to release only resources the adapter owns. Make it idempotent if the same adapter might be disposed directly or shared across kits. Do not await `kit.close()` from inside that kit's check or disposal hook, because close waits for those callbacks.
