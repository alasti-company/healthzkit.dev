# Long-lived Node.js production example

Hono + Postgres on Node.js 22.12+, with background readiness checks, Kubernetes probes, and bounded graceful shutdown. This is separate from the Cloudflare Workers example in `../example-hono`; do not use background scheduling in Workers/serverless processes.

## Run locally

From the repository root (requires Vite+ and Docker for the sample database):

```bash
vp install
docker run --rm --name healthzkit-postgres -e POSTGRES_PASSWORD=example -p 5432:5432 -d postgres:17
vp run --filter '@healthzkit/example-node...' build
DATABASE_URL=postgres://postgres:example@localhost:5432/postgres vp run --filter @healthzkit/example-node start
```

`PORT` defaults to `3000`. In another terminal:

```bash
curl -i localhost:3000/healthz/live
curl -i localhost:3000/healthz/ready
curl -i localhost:3000/
# Stop Postgres: readiness becomes 503 after the next scheduled refresh.
docker stop healthzkit-postgres
```

Send SIGTERM or Ctrl-C to the **Node process** to exercise shutdown. The app owns one `pg.Pool`; both the application handler and `pgAdapter({ client: pool })` share it. The adapter releases borrowed clients but never ends the pool. Connection/query/server-side statement limits bound database work separately from healthzkit's 2s timeout (a health-check timeout alone does not cancel a database query).

## Lifecycle and safe output

- `/healthz/live` checks only the process. A database outage must not restart every replica.
- `/healthz/ready` uses a 5s scheduled database check; it is not an instantaneous outage detector. The initial request shares the first refresh. Stale cached results follow healthzkit's documented interval-plus-timeout rule.
- `output.exposeError: false` prevents driver errors from reaching probe clients. Application errors are generic too; do not add metadata containing credentials, SQL, or internal hosts. Keep health endpoints internal via your network policy/ingress configuration.
- On SIGTERM/SIGINT, readiness becomes 503 immediately, new business requests get 503, and scheduling stops. Liveness stays 200 while draining.
- The server stays open for 5s to allow endpoint changes to propagate, then stops accepting connections and waits for active requests. Only then does the application call `pool.end()`.
- Repeated signals share one shutdown. A hard 25s deadline exits with failure if HTTP or pool cleanup stalls. Tune the propagation delay and deadline for your load balancer; Kubernetes grace must remain longer than the deadline.

## Container and Kubernetes

Build from the **repository root**. The runtime uses a non-root Node user and exec-form CMD so Node receives SIGTERM directly:

```bash
docker build -f apps/example-node/Dockerfile -t healthzkit-example:local .
docker run --rm -p 3000:3000 -e DATABASE_URL='<database URL reachable from container>' healthzkit-example:local
```

For a local cluster, load the image into it (for example `kind load docker-image healthzkit-example:local`). For a remote cluster, push the image and replace `image` in `k8s.yaml` with an immutable registry reference.

```bash
kubectl create secret generic healthzkit-example-db --from-literal=DATABASE_URL='<cluster-reachable database URL>'
kubectl apply -f apps/example-node/k8s.yaml
kubectl rollout status deployment/healthzkit-example
kubectl port-forward service/healthzkit-example 3000:80
```

The manifest intentionally does not deploy Postgres or commit credentials. Supply your managed database and TLS settings. `localhost` in a pod/container is not your development machine. Startup/liveness use the process-only route; readiness uses the dependency route. There is no `preStop` sleep: the application owns the drain delay, inside Kubernetes' 30s grace budget. Add your own namespace, network policy, secret management, and disruption policy before deployment.

## Validate

```bash
vp run --filter @healthzkit/example-node test
vp check
```

Unit tests cover probe separation, error redaction, shared-pool ownership, shutdown ordering/idempotence, and the hard deadline with a mocked database. They do not replace a real database/container/cluster smoke test.
