# Cloudflare Workers example

Hono on Workers with on-demand startup, liveness, and readiness checks. This is separate from the long-lived Node.js application in `../example-node`.

Workers freeze the isolate between requests. This example does not call `kit.start()` and does not register background timers. It also does not install signal handlers or drain a pool: the platform discards the isolate, so those steps belong to a process you start and stop.

`/healthz/live` and `/healthz/startup` confirm the isolate can answer. `/healthz/ready` calls `https://example.com` through `httpAdapter` with a 1.5s client timeout. Replace that URL with a dependency this Worker can reach. Public responses hide errors and metadata. `createFetchHandler` serves GET and HEAD, forwards response headers, and returns 405 for other methods on the health routes.

## Run

From the repository root:

```bash
vp install
vp run --filter @healthzkit/example-hono dev
```

Deploy with `vp run --filter @healthzkit/example-hono deploy`.
