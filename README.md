# healthzkit

Framework-agnostic **liveness** and **readiness** probes for Node.js. Define checks as small adapters; healthzkit runs them in parallel, rolls up status, maps to HTTP responses, and can schedule checks in the background so probes read cached results instead of hitting dependencies on every request.

This monorepo publishes the core library and optional adapters for common data stores.

## Packages

| Package                                                 | npm                         | Description                                                                                                                                                                                                   |
| ------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`healthzkit`](./packages/healthzkit)                   | `healthzkit`                | Core probe runner, routing, scheduling, and HTTP mapping                                                                                                                                                      |
| [`@healthzkit/postgres`](./packages/postgres)           | `@healthzkit/postgres`      | Adapters for [`pg`](https://node-postgres.com/) and [`postgres`](https://github.com/porsager/postgres)                                                                                                        |
| [`@healthzkit/redis`](./packages/redis)                 | `@healthzkit/redis`         | Adapters for [`ioredis`](https://github.com/redis/ioredis), [`redis`](https://github.com/redis/node-redis), and [`@upstash/redis`](https://github.com/upstash/upstash-redis)                                  |
| [`@healthzkit/valkey`](./packages/valkey)               | `@healthzkit/valkey`        | Adapters for [`iovalkey`](https://github.com/valkey-io/iovalkey) and [`@valkey/valkey-glide`](https://github.com/valkey-io/valkey-glide)                                                                      |
| [`@healthzkit/mongo`](./packages/mongo)                 | `@healthzkit/mongo`         | Adapters for the official [`mongodb`](https://www.mongodb.com/docs/drivers/node/current/) driver and [`mongoose`](https://mongoosejs.com/)                                                                    |
| [`@healthzkit/mysql`](./packages/mysql)                 | `@healthzkit/mysql`         | Adapters for [`mysql`](https://github.com/mysqljs/mysql) and [`mysql2`](https://github.com/sidorares/node-mysql2)                                                                                             |
| [`@healthzkit/sqlite`](./packages/sqlite)               | `@healthzkit/sqlite`        | Adapters for [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3), [`sqlite3`](https://github.com/TryGhost/node-sqlite3), and [`@libsql/client`](https://github.com/tursodatabase/libsql-client-ts) |
| [`@healthzkit/dynamo`](./packages/dynamo)               | `@healthzkit/dynamo`        | Adapters for AWS SDK v2 [`aws-sdk`](https://github.com/aws/aws-sdk-js) and v3 [`@aws-sdk/client-dynamodb`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/)                           |
| [`@healthzkit/s3`](./packages/s3)                       | `@healthzkit/s3`            | Adapters for AWS SDK v2 [`aws-sdk`](https://github.com/aws/aws-sdk-js) and v3 [`@aws-sdk/client-s3`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/) (`ListBuckets`)                       |
| [`@healthzkit/minio`](./packages/minio)                 | `@healthzkit/minio`         | Adapter for the official [`minio`](https://github.com/minio/minio-js) client (`listBuckets`) — MinIO and other S3-compatible object storage                                                                   |
| [`@healthzkit/rabbitmq`](./packages/rabbitmq)           | `@healthzkit/rabbitmq`      | Adapters for [`amqplib`](https://github.com/amqp-node/amqplib) and [`amqp-connection-manager`](https://github.com/jwalton/node-amqp-connection-manager)                                                       |
| [`@healthzkit/elasticsearch`](./packages/elasticsearch) | `@healthzkit/elasticsearch` | Adapter for the official [`@elastic/elasticsearch`](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/index.html) client (`cluster.health`)                                         |
| [`@healthzkit/http`](./packages/http)                   | `@healthzkit/http`          | Adapter that probes HTTP/HTTPS endpoints via global **`fetch`** — status codes, timeouts, redirects, and optional response metadata (Node.js 18+)                                                             |
| [`@healthzkit/drizzle`](./packages/drizzle)             | `@healthzkit/drizzle`       | Adapter for [Drizzle ORM](https://orm.drizzle.team/) — health-check an existing `db` instance via `execute` / `run` (peer: `drizzle-orm` only; drivers stay in your app)                                      |
| [`@healthzkit/prisma`](./packages/prisma)               | `@healthzkit/prisma`        | Adapter for [Prisma](https://www.prisma.io/) — health-check an existing `PrismaClient` via `$connect` and `$queryRawUnsafe` (peer: `@prisma/client`; drivers stay in your app)                                |

See each package README for install instructions, API details, and examples.

## Quick start

```bash
npm install healthzkit
```

```ts
import { createHealthKit } from "healthzkit";

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
          // ping your database, etc.
          return { status: "ok" };
        },
      },
    },
  ],
});

const res = await kit.handleRequest({ path: "/healthz/ready", method: "GET" });
```

Full API documentation: [`packages/healthzkit/README.md`](./packages/healthzkit/README.md).

## Development

Requires [Node.js](https://nodejs.org/) ≥ 22.12 and [pnpm](https://pnpm.io/) (see `packageManager` in `package.json`). Commands use the [Vite+](https://viteplus.dev/) `vp` CLI.

Install dependencies:

```bash
vp install
```

Run tests across all packages:

```bash
vp run -r test
```

Format, lint, and type-check:

```bash
vp check
```

Build all packages:

```bash
vp run -r build
```

Run the full readiness check (format, lint, test, build):

```bash
vp run ready
```

See [`AGENTS.md`](./AGENTS.md) for Vite+ / `vp` conventions used in this repo.

## License

Copyright (C) 2026 Alasti Company

This project is licensed under the GNU Affero General Public License v3.0.
See [LICENSE](./LICENSE) for the full license text.
