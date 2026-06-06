---
title: Introduction
description: Learn what Healthzkit is, when to use liveness and readiness probes in Node.js, how checks and adapters fit together, and how to install the core ESM package.
---

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
- [Framework guides](./frameworks.md) — Elysia, Express, Hono, Next.js, and Node HTTP wiring patterns.
- [Responses and HTTP](./responses-and-http.md) — rollup rules, status codes, output format, and public types.

### Optional adapters

Official adapter packages cover **queues**, **databases**, **storage**, **search**, and **HTTP endpoints** today.

#### Queues

- [RabbitMQ](/adapter/rabbitmq) — `@healthzkit/rabbitmq` (`amqplib`, `amqp-connection-manager`).

#### Databases

- [Redis](/adapter/redis) — `@healthzkit/redis` (`ioredis`, `node-redis`, Upstash).
- [Valkey](/adapter/valkey) — `@healthzkit/valkey` (`iovalkey`, `@valkey/valkey-glide`).
- [Postgres](/adapter/postgres) — `@healthzkit/postgres` (`pg`, `postgres`).
- [MySQL](/adapter/mysql) — `@healthzkit/mysql` (`mysql`, `mysql2`).
- [MongoDB](/adapter/mongo) — `@healthzkit/mongo` (`mongodb`, `mongoose`).
- [SQLite](/adapter/sqlite) — `@healthzkit/sqlite` (`better-sqlite3`, `sqlite3`, `@libsql/client`).
- [DynamoDB](/adapter/dynamo) — `@healthzkit/dynamo` (`aws-sdk`, `@aws-sdk/client-dynamodb`).
- [Drizzle ORM](/adapter/drizzle) — `@healthzkit/drizzle` (`drizzle-orm`; pass your existing `db` instance).
- [Prisma](/adapter/prisma) — `@healthzkit/prisma` (`@prisma/client`; pass your existing `PrismaClient`).
- [Elasticsearch](/adapter/elasticsearch) — `@healthzkit/elasticsearch` (`@elastic/elasticsearch`).

#### Storage

- [S3](/adapter/s3) — `@healthzkit/s3` (`aws-sdk`, `@aws-sdk/client-s3`).
- [MinIO](/adapter/minio) — `@healthzkit/minio` (`minio`).

#### HTTP

- [HTTP endpoints](/adapter/http) — `@healthzkit/http` (global `fetch`; Node.js 18+).
