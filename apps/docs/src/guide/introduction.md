# Introduction

**Healthzkit** is a small, framework-agnostic library for **liveness** and **readiness** probes in Node.js and similar runtimes.

You define **checks** as adapters that return a simple status (`ok`, `degraded`, or `fail`). Healthzkit runs the relevant checks in parallel, **rolls up** an overall status, maps that to an **HTTP status code** and **JSON or plain-text** body, and can **schedule** checks in the background so probes read cached results instead of hitting databases or third parties on every request.

## When to use it

Use healthzkit when you want:

- One place to define health checks and wire them to `/live` and `/ready` (or your own base path).
- Consistent JSON or text payloads for operators and orchestrators.
- Optional background refresh for slow dependencies without blocking probe latency.

## Install

The package is **ESM-only** (`"type": "module"`). The published entry is `healthzkit` → `./dist/index.mjs`.

```bash
pnpm add healthzkit
# or
npm install healthzkit
```

## Next steps

- [Getting started](./getting-started.md) — create a kit, attach checks, handle HTTP.
- [Checks and adapters](./checks-and-adapters.md) — configuration, timeouts, and failure mapping.
- [Scheduling](./scheduling.md) — cached results and lifecycle (`start` / `stop`).
- [Responses and HTTP](./responses-and-http.md) — rollup rules, status codes, output format, and public types.

### Optional adapters

- [Redis](./adapters-redis.md) — `@healthzkit/redis` (`ioredis`, `node-redis`, Upstash).
- [RabbitMQ](./adapters-rabbitmq.md) — `@healthzkit/rabbitmq` (`amqplib`, `amqp-connection-manager`).
- [Postgres](./adapters-postgres.md) — `@healthzkit/postgres` (`pg`, `postgres`).
- [MySQL](./adapters-mysql.md) — `@healthzkit/mysql` (`mysql`, `mysql2`).
- [MongoDB](./adapters-mongo.md) — `@healthzkit/mongo` (`mongodb`, `mongoose`).
- [SQLite](./adapters-sqlite.md) — `@healthzkit/sqlite` (`better-sqlite3`, `sqlite3`, `@libsql/client`).
- [DynamoDB](./adapters-dynamo.md) — `@healthzkit/dynamo` (`aws-sdk`, `@aws-sdk/client-dynamodb`).
