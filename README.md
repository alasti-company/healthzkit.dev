# healthzkit

[![npm](https://img.shields.io/npm/v/healthzkit.svg)](https://www.npmjs.com/package/healthzkit)
[![license](https://img.shields.io/npm/l/healthzkit.svg)](LICENSE)
[![docs](https://img.shields.io/badge/docs-healthzkit.dev-4F46E5.svg)](https://healthzkit.dev)

Framework-agnostic **liveness**, **readiness**, and **startup** probes for Node.js. Define checks as small adapters; healthzkit runs them in parallel, rolls up status, maps to HTTP responses, and can schedule checks in the background so probes read cached results instead of hitting dependencies on every request.

This monorepo publishes the core library and optional adapters for common data stores.

```bash
npm install healthzkit hono @healthzkit/postgres pg
```

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
```

`GET /healthz/live`, `GET /healthz/ready`, and `GET /healthz/startup` are the Kubernetes-style probes. Failed readiness returns **503** by default. Full API: [`packages/healthzkit/README.md`](./packages/healthzkit/README.md) · site: [healthzkit.dev](https://healthzkit.dev).

## Packages

| Package                                                 | npm                         | Description                                                                                                                                                                                                   |
| ------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`healthzkit`](./packages/healthzkit)                   | `healthzkit`                | Core probe runner, routing, scheduling, HTTP mapping, and Fetch-API helpers                                                                                                                                   |
| [`@healthzkit/postgres`](./packages/postgres)           | `@healthzkit/postgres`      | Adapters for [`pg`](https://node-postgres.com/) and [`postgres`](https://github.com/porsager/postgres)                                                                                                        |
| [`@healthzkit/cockroach`](./packages/cockroach)         | `@healthzkit/cockroach`     | Adapter for CockroachDB via [`pg`](https://node-postgres.com/) — SQL probes over the PostgreSQL wire protocol                                                                                                 |
| [`@healthzkit/redis`](./packages/redis)                 | `@healthzkit/redis`         | Adapters for [`ioredis`](https://github.com/redis/ioredis), [`redis`](https://github.com/redis/node-redis), and [`@upstash/redis`](https://github.com/upstash/upstash-redis)                                  |
| [`@healthzkit/valkey`](./packages/valkey)               | `@healthzkit/valkey`        | Adapters for [`iovalkey`](https://github.com/valkey-io/iovalkey) and [`@valkey/valkey-glide`](https://github.com/valkey-io/valkey-glide)                                                                      |
| [`@healthzkit/memcached`](./packages/memcached)         | `@healthzkit/memcached`     | Adapters for [`memcached`](https://github.com/3rd-Eden/memcached) and [`memjs`](https://github.com/memcachier/memjs)                                                                                          |
| [`@healthzkit/mongo`](./packages/mongo)                 | `@healthzkit/mongo`         | Adapters for the official [`mongodb`](https://www.mongodb.com/docs/drivers/node/current/) driver and [`mongoose`](https://mongoosejs.com/)                                                                    |
| [`@healthzkit/mysql`](./packages/mysql)                 | `@healthzkit/mysql`         | Adapters for [`mysql`](https://github.com/mysqljs/mysql) and [`mysql2`](https://github.com/sidorares/node-mysql2)                                                                                             |
| [`@healthzkit/sqlite`](./packages/sqlite)               | `@healthzkit/sqlite`        | Adapters for [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3), [`sqlite3`](https://github.com/TryGhost/node-sqlite3), and [`@libsql/client`](https://github.com/tursodatabase/libsql-client-ts) |
| [`@healthzkit/dynamo`](./packages/dynamo)               | `@healthzkit/dynamo`        | Adapters for AWS SDK v2 [`aws-sdk`](https://github.com/aws/aws-sdk-js) and v3 [`@aws-sdk/client-dynamodb`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/)                           |
| [`@healthzkit/s3`](./packages/s3)                       | `@healthzkit/s3`            | Adapters for AWS SDK v2 [`aws-sdk`](https://github.com/aws/aws-sdk-js) and v3 [`@aws-sdk/client-s3`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/) (`ListBuckets`)                       |
| [`@healthzkit/sqs`](./packages/sqs)                     | `@healthzkit/sqs`           | Adapter for AWS SDK v3 `@aws-sdk/client-sqs` (`GetQueueAttributes`, optional approximate backlog thresholds)                                                                                                  |
| [`@healthzkit/minio`](./packages/minio)                 | `@healthzkit/minio`         | Adapter for the official [`minio`](https://github.com/minio/minio-js) client (`listBuckets`) — MinIO and other S3-compatible object storage                                                                   |
| [`@healthzkit/rabbitmq`](./packages/rabbitmq)           | `@healthzkit/rabbitmq`      | Adapters for [`amqplib`](https://github.com/amqp-node/amqplib) and [`amqp-connection-manager`](https://github.com/jwalton/node-amqp-connection-manager)                                                       |
| [`@healthzkit/kafka`](./packages/kafka)                 | `@healthzkit/kafka`         | Adapters for [`kafkajs`](https://kafka.js.org/) and [`node-rdkafka`](https://github.com/Blizzard/node-rdkafka) — cluster metadata probes for readiness checks                                                 |
| [`@healthzkit/elasticsearch`](./packages/elasticsearch) | `@healthzkit/elasticsearch` | Adapter for the official [`@elastic/elasticsearch`](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/index.html) client (`cluster.health`)                                         |
| [`@healthzkit/http`](./packages/http)                   | `@healthzkit/http`          | Adapter that probes HTTP/HTTPS endpoints via global **`fetch`** — status codes, timeouts, redirects, and optional response metadata                                                                           |
| [`@healthzkit/drizzle`](./packages/drizzle)             | `@healthzkit/drizzle`       | Adapter for [Drizzle ORM](https://orm.drizzle.team/) — health-check an existing `db` instance via `execute` / `run` (peer: `drizzle-orm` only; drivers stay in your app)                                      |
| [`@healthzkit/prisma`](./packages/prisma)               | `@healthzkit/prisma`        | Adapter for [Prisma](https://www.prisma.io/) — health-check an existing `PrismaClient` via `$connect` and `$queryRawUnsafe` (peer: `@prisma/client`; drivers stay in your app)                                |

See each package README for install instructions, API details, and examples.

## Production example

For an integration recipe you can follow with a coding agent, see [Integrate healthzkit](https://healthzkit.dev/guide/integrate-healthzkit). Agents can discover Markdown documentation through [llms.txt](https://healthzkit.dev/llms.txt), or read the [full documentation export](https://healthzkit.dev/llms-full.txt).

See [`apps/example-node`](./apps/example-node) for a long-lived Node.js + Hono + Postgres application with Kubernetes probes, a shared database pool, safe error output, and bounded graceful shutdown. The existing [`apps/example-hono`](./apps/example-hono) demonstrates Cloudflare Workers instead.

## Development

Requires [Node.js](https://nodejs.org/) ≥ 22.12 and [pnpm](https://pnpm.io/) (see `packageManager` in `package.json`). Commands use the [Vite+](https://viteplus.dev/) `vp` CLI. Published packages declare `engines.node` ≥ 22.12.

Install dependencies:

```bash
vp install
```

Run tests across all packages:

```bash
vp run -r test
```

### Real-service integration tests

Normal unit runs skip the real-service suites. CI runs them separately with the same
[Compose configuration](tools/integration/compose.yml) used locally, waits for service health,
and always removes containers and volumes. See the [integration guide](tools/integration/README.md)
for driver coverage, versions, environment variables, failure scenarios, and remaining gaps.

```bash
vp install
vp run -r build
(
trap 'docker compose -f tools/integration/compose.yml down -v --remove-orphans --timeout 10' EXIT
docker compose -f tools/integration/compose.yml up -d --wait --wait-timeout 180
# Set the service URLs from tools/integration/README.md, then:
vp run --no-cache test:integration
)
```

### Static checks

Format, lint, and type-check:

```bash
vp check
```

Build all packages:

```bash
vp run -r build
```

Smoke-test the packages users install (build first):

```bash
vp run -r build
vp run test:packages
```

This packs all public packages, installs the tarballs into a temporary consumer outside the
workspace, imports every JavaScript entrypoint, runs a core readiness probe, and compiles a
strict NodeNext TypeScript consumer against the published declarations. Peer drivers and
`@types` packages use the exact versions installed from the workspace lockfile. The temporary
consumer is always removed. Registry access is required; native install scripts are disabled.
This checks packaging and declaration resolution, not real database connectivity, native-driver
loading, or every supported peer version. TypeScript uses `skipLibCheck` to avoid validating
third-party drivers' declaration internals (including optional Drizzle dialect dependencies);
consumer code and the core API's negative type assertion remain checked.

CI runs builds, unit tests, and packed-consumer checks on Node.js 22 and 24; formatting and
linting run once on Node.js 22.

Run the full readiness check (format, lint, test, build):

```bash
vp run ready
```

See [`AGENTS.md`](./AGENTS.md) for Vite+ / `vp` conventions used in this repo.

## License

Copyright (C) 2026 Alasti Company

This project is licensed under the MIT License.
See [LICENSE](./LICENSE) for the full license text.

## Resource cleanup

After draining your application traffic, call `await kit.close()` to stop scheduling, wait for pending health checks, and dispose adapter-owned clients and pools. Close is terminal and idempotent; new health requests reject once it begins. Cleanup attempts every adapter and reports failures with `AggregateError`. Supplied clients remain yours to close. Use `kit.stop()` when you only want to pause scheduling and keep the kit reusable. See [shutdown and disposal](packages/healthzkit/README.md#shutdown-and-disposal) for pending-work and failure behavior.
