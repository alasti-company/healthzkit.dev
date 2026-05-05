# healthzkit

Framework-agnostic **liveness** and **readiness** probes for Node.js (and similar runtimes). You define checks as small adapters; **healthzkit** runs them in parallel, rolls up overall status, maps that to HTTP status and a JSON or plain-text body, and optionally **schedules** checks in the background so probes can read cached results instead of hitting dependencies on every request.

## Install

```bash
npm install healthzkit
```

The package is ESM-only (`"type": "module"`). The published entry is `./dist/index.mjs` (see `package.json` `exports`).

## Quick start

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

// Wire into your HTTP server: path + method from the incoming request
const res = await kit.handleRequest({ path: "/healthz/ready", method: "GET" });
if (res) {
  // res.status, res.headers, res.body
}
```

Call `kit.handleLiveness()` or `kit.handleReadiness()` directly if you already route those endpoints yourself.

## Routes and `basePath`

By default, **healthzkit** expects:

| Path               | Behavior                                        |
| ------------------ | ----------------------------------------------- |
| `{basePath}/live`  | Runs checks whose `type` includes `"liveness"`  |
| `{basePath}/ready` | Runs checks whose `type` includes `"readiness"` |

Default `basePath` is `/healthz`. Override with `basePath` in config (e.g. `/api/health` → `/api/health/live`).

`handleRequest(req)` returns `null` if `req.path` does not match either route, so you can try it first and fall through to your app.

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

## Scheduling

For expensive checks (database, external APIs), you can run them on a timer and serve probes from cache:

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
