---
layout: home
title: Healthzkit — Liveness & Readiness Probes for Node.js
titleTemplate: false
description: Healthzkit gives Node.js apps framework-agnostic liveness and readiness probes with parallel checks, rollup status, HTTP mapping, scheduling, and database adapters.

hero:
  name: Healthzkit
  text: Probing for Node.js
  tagline: Framework-agnostic health checks with parallel runs, rollup status, HTTP mapping, and optional background scheduling.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: GitHub
      link: https://github.com/alasti-company/healthzkit.dev

features:
  - title: Liveness and readiness
    details: Tag checks for liveness, readiness, or both. Kubernetes-style /healthz/live and /healthz/ready, with per-check timeouts and clear rollup to 200 or 503.
  - title: Fetch, Hono, Express, Next.js
    details: toFetchResponse and createFetchHandler map onto Fetch APIs. Framework guides cover Express, Fastify, Hono, Elysia, and Next.js App Router.
  - title: Background scheduling
    details: Run expensive checks on an interval and serve probes from cache so kubelet does not stampede Postgres on every poll.
  - title: Official adapters
    details: Postgres, Redis, Valkey, MySQL, MongoDB, SQLite, Kafka, RabbitMQ, S3, DynamoDB, Elasticsearch, Drizzle, Prisma, HTTP, and more — install only the clients you already use.
---
