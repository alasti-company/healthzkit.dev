---
title: CockroachDB adapter
description: Use @healthzkit/cockroach with pg for CockroachDB—SQL probes over the PostgreSQL wire protocol, latency metadata, pool options, and Healthzkit readiness check examples.
---

# CockroachDB adapter (`@healthzkit/cockroach`)

The **`@healthzkit/cockroach`** package provides a [`HealthAdapter`](/guide/checks-and-adapters) helper for **[CockroachDB](https://www.cockroachlabs.com/)** via **`pg`** (node-postgres). CockroachDB speaks the PostgreSQL wire protocol, so the adapter runs a lightweight SQL probe (default **`SELECT 1`**) with **`client.query`**. Successful checks return **`ok`** with `metadata.latencyMs` plus any fields from an optional **`metadata`** hook; failures return **`fail`** with the caught error.

Install the adapter package and the **`pg`** client:

```bash
pnpm add @healthzkit/cockroach pg
```

**Peer:** `pg` >= 8.

## Options

`cockroachPgAdapter` accepts `BaseCockroachOptions`:

| Option         | Description                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------- |
| **`query`**    | SQL string executed for the probe. Default **`SELECT 1`**.                                        |
| **`metadata`** | Optional async `(client) => Record<string, unknown>` merged into check metadata with `latencyMs`. |

Pass either **`connectionString`** or **`client`** (not both).

## Connection string

Pass **`connectionString`**. The adapter maintains an internal **`Pool`** with **`max: 1`**, **`connect()`**s a client for each check, runs **`client.query(query)`**, then **`release()`**s the client in a **`finally`** block.

Optional **`pgOption`** merges into the internal `Pool` constructor (everything except `connectionString`).

```ts
import { createHealthKit } from "healthzkit";
import { cockroachPgAdapter } from "@healthzkit/cockroach";

const kit = createHealthKit({
  checks: [
    {
      name: "cockroach",
      type: ["readiness"],
      adapter: cockroachPgAdapter({
        connectionString: process.env.DATABASE_URL!,
        query: "SELECT 1",
      }),
    },
  ],
});
```

## Existing client or pool

Pass **`client`** as:

- A **`Pool`**: each check calls **`pool.connect()`**, runs the query on the **`PoolClient`**, then releases it.
- A **`PoolClient`** or other **`ClientBase`**: the query runs on that instance; release is a no-op.

```ts
import { Pool } from "pg";
import { cockroachPgAdapter } from "@healthzkit/cockroach";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

const adapter = cockroachPgAdapter({
  client: pool,
  query: "SELECT current_database()",
});
```

## Scheduling

For busy clusters, pair this adapter with a **`schedule`** on the check so readiness reads cached results (see [Scheduling](/guide/scheduling)).
