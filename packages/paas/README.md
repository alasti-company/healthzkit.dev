# @healthzkit/paas

Serve the single health URL that Fly, Vercel, Railway, Render, Cloud Run, Koyeb, DigitalOcean App Platform, Azure App Service, and Azure Container Apps request. Each platform export maps that pathname onto a healthzkit liveness, readiness, or startup probe.

```sh
npm install healthzkit @healthzkit/paas
```

```ts
import { Hono } from "hono";
import { createHealthKit } from "healthzkit";
import { createPaasFetchHandler, fly } from "@healthzkit/paas/fly";

const platform = fly();
const kit = createHealthKit({
  checks: [
    {
      name: "process",
      type: ["liveness", "readiness"],
      adapter: { check: async () => ({ status: "ok" }) },
    },
  ],
  output: { detail: "status", exposeError: false, exposeMetadata: false },
});

kit.start();

const health = createPaasFetchHandler(kit, platform);
const app = new Hono();
app.all(platform.path, async (c) => {
  const response = await health(c.req.raw);
  return response ?? c.notFound();
});
```

Point the platform at `platform.path` (`/healthz` on Fly, `/health` on Railway and Render, `/api/health` on Vercel). healthzkit still serves `/healthz/live`, `/healthz/ready`, and `/healthz/startup` when you mount those routes yourself.

The handler accepts GET and HEAD. Any other method on that pathname returns **405** with `Allow: GET, HEAD`. A different pathname returns `null` from `platform.handle()` and from `createPaasFetchHandler`, so the request can fall through to the rest of the app. Status codes are passed through. The defaults are **200** for `ok` and `degraded`, and **503** for a failed readiness check. A custom `onFail.httpStatus` has to sit outside `platform.healthyStatus`, or the platform will treat the failure as healthy.

`platform.metadata` is non-secret runtime identity for your logs. It is not written into the HTTP body. These URLs are often reachable on the public internet, so the example uses status-only output. See [Responses and HTTP](https://healthzkit.dev/guide/responses-and-http).

Listen on `0.0.0.0` and the platform `PORT`. On long-lived services, [schedule](https://healthzkit.dev/guide/scheduling) slow dependency checks so the platform timeout is not spent waiting on a database. On Vercel, skip `kit.start()` and run checks on each request.

## Package entrypoints

| Import                                  | Export                                                               |
| --------------------------------------- | -------------------------------------------------------------------- |
| `@healthzkit/paas`                      | Every platform, `detectPaas`, `createPaasFetchHandler`, `handlePaas` |
| `@healthzkit/paas/fly`                  | `fly`                                                                |
| `@healthzkit/paas/vercel`               | `vercel`                                                             |
| `@healthzkit/paas/railway`              | `railway`                                                            |
| `@healthzkit/paas/render`               | `render`                                                             |
| `@healthzkit/paas/cloud-run`            | `cloudRun`                                                           |
| `@healthzkit/paas/koyeb`                | `koyeb`                                                              |
| `@healthzkit/paas/digitalocean`         | `digitalOcean`                                                       |
| `@healthzkit/paas/azure-app-service`    | `azureAppService`                                                    |
| `@healthzkit/paas/azure-container-apps` | `azureContainerApps`                                                 |

Each platform subpath also exports `createPaasFetchHandler` and `handlePaas`.

## Contracts

| Platform                  | Path          | Healthy HTTP status  | Request timeout             | After deploy                    | Restarts                              |
| ------------------------- | ------------- | -------------------- | --------------------------- | ------------------------------- | ------------------------------------- |
| Fly.io                    | `/healthz`    | 200–299              | Set in `fly.toml`           | Keeps checking; stops routing   | No                                    |
| Vercel                    | `/api/health` | 200–299 for monitors | Function limit              | Vercel does not probe this path | No                                    |
| Railway                   | `/health`     | 200–299              | Deploy window, default 300s | Deploy only                     | No                                    |
| Render                    | `/health`     | 200–399              | 5s                          | Keeps checking                  | After 60s of failure                  |
| Cloud Run                 | `/health`     | 200–399              | 1s default                  | Keeps checking                  | Liveness only                         |
| Koyeb                     | `/health`     | 200–399              | 5s default                  | Keeps checking                  | After 3 failures by default           |
| DigitalOcean App Platform | `/health`     | 200–399              | 1s default                  | Keeps checking                  | Liveness probe only                   |
| Azure App Service         | `/health`     | 200–299              | 60s                         | About once a minute             | Can replace the instance after 1 hour |
| Azure Container Apps      | `/health`     | 200–399              | 1s default                  | Keeps checking                  | Liveness only                         |

`fly({ path, check, env })` overrides the pathname and probe. `check` is `"readiness"` unless you set `"liveness"` or `"startup"`. Pass `env` in tests; otherwise the factory reads `process.env`.

`detectPaas(env?)` returns the profiles whose runtime marker is present, in the table order. DigitalOcean App Platform has no marker this package recognizes, so select `digitalOcean()` yourself.

## Fly.io

Service HTTP checks expect a 2xx response and do not follow redirects. A 301 or 302 fails the check. Serve `/healthz` directly, including when the rest of the app redirects HTTP to HTTPS. Fly calls the Machine over the private network, not the public `fly.dev` hostname. A failing check stops routing and does not restart the Machine.

```toml
[[http_service.checks]]
grace_period = "10s"
interval = "15s"
method = "GET"
timeout = "5s"
path = "/healthz"
```

Set `timeout` to at least the healthzkit check deadline. The default deadline is 5 seconds. `fly().metadata` may include `app`, `region`, `machine`, and `processGroup`.

## Vercel

Vercel does not send a platform health probe. `vercel()` serves `/api/health` for uptime monitors and adds `CDN-Cache-Control: no-store` and `Vercel-CDN-Cache-Control: no-store` beside healthzkit's `Cache-Control: no-store`. Exclude the path from auth middleware. Deployment protection still applies to preview URLs. Skip `kit.start()` on serverless.

```ts
import { createHealthKit } from "healthzkit";
import { createPaasFetchHandler, vercel } from "@healthzkit/paas/vercel";

const kit = createHealthKit({
  checks: [
    {
      name: "process",
      type: ["readiness"],
      adapter: { check: async () => ({ status: "ok" }) },
    },
  ],
  output: { detail: "status", exposeError: false, exposeMetadata: false },
});

const health = createPaasFetchHandler(kit, vercel());

export function GET(request: Request) {
  return health(request);
}

export function HEAD(request: Request) {
  return health(request);
}
```

`vercel().metadata` may include `env`, `region`, `deployment`, `project`, `commit`, and `ref`.

## Railway

Railway requests the healthcheck path during deploy and accepts any 2xx before it shifts traffic. It does not keep probing after the deploy is live. The Host header is `healthcheck.railway.app`; allow that host when the app filters Host. Listen on `PORT`. The default deploy window is 300 seconds (`RAILWAY_HEALTHCHECK_TIMEOUT_SEC`).

```toml
[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 300
```

## Render

Render web services send GET and accept 2xx or 3xx within 5 seconds. The Host header is a verified custom domain, or the `onrender.com` hostname when there is none. Consecutive failures stop routing after 15 seconds and restart the instance after 60 seconds, so a dependency failure on this path can restart the process. Private services use TCP checks only.

```yaml
services:
  - type: web
    runtime: node
    name: api
    healthCheckPath: /health
```

## Cloud Run

Cloud Run treats 2xx and 3xx as success. The default HTTP probe timeout is 1 second, which is shorter than healthzkit's 5 second check deadline. Raise the probe timeout or keep the checks inside it. Readiness stops new traffic and leaves the instance running. Liveness shuts the instance down; use `cloudRun({ path: "/live", check: "liveness" })` only for failures a restart can fix. Cloud Run can route traffic as soon as the startup probe passes, so a startup probe has to mean the instance can serve.

## Koyeb

Koyeb's default check is TCP and does not call this path. Switch the port's health check to HTTP, method GET, and path `/health`. Success is 2xx or 3xx. The default timeout is 5 seconds, and the default of 3 consecutive failures restarts the instance. The same check also gates startup.

## DigitalOcean App Platform

Set `http_path` or App Platform keeps using TCP. HTTP success is 200 through 399. The default `timeout_seconds` is 1. `health_check` is the readiness path this export serves. `liveness_health_check` restarts the component; pass `check: "liveness"` only for that probe. `detected` stays false.

```yaml
health_check:
  http_path: /health
  timeout_seconds: 5
```

## Azure App Service

There is no default path. Set `/health` in the Health check blade. App Service accepts 200 through 299, pings about once a minute, and treats a response slower than one minute as failed. It does not follow redirects. Allow anonymous access to the path when the app has its own auth. An instance that stays unhealthy for one hour can be replaced.

## Azure Container Apps

HTTP probes succeed on 200 through 399. The default timeout is 1 second. Readiness stops new traffic. Liveness restarts the replica; pass `check: "liveness"` only for that probe.

Full guide: [healthzkit.dev/adapter/paas](https://healthzkit.dev/adapter/paas).
