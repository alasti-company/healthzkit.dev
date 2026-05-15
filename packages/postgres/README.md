# @healthzkit/postgres

Postgres **healthzkit** `HealthAdapter` helpers for **[`pg`](https://node-postgres.com/)** (node-postgres) and **[`postgres`](https://github.com/porsager/postgres)** (Postgres.js). Successful checks return `ok` with `metadata.latencyMs` plus any fields from an optional `metadata` hook; failures return `fail` with the caught error.

## Install

```bash
npm install @healthzkit/postgres healthzkit
# plus one of:
npm install pg
npm install postgres
```

`pg` and `postgres` are optional peers—install the driver you use.

## Package entrypoints

| Import                          | Exports                                            |
| ------------------------------- | -------------------------------------------------- |
| `@healthzkit/postgres`          | `pgAdapter`, `postgresJsAdapter`, and option types |
| `@healthzkit/postgres/pg`       | `pgAdapter` only                                   |
| `@healthzkit/postgres/postgres` | `postgresJsAdapter` only                           |

Use subpath imports when you want to avoid pulling both drivers into your bundle analysis path.

## Shared options

Both factories accept:

| Option     | Description                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `query`    | SQL executed for the probe. Default `SELECT 1`.                                                   |
| `metadata` | Optional async `(client) => Record<string, unknown>` merged into check metadata with `latencyMs`. |

Pass either `connectionString` or `client` (not both).

## `pgAdapter` (`pg`)

**Peer:** `pg` ≥ 8.

### Connection string

The adapter maintains an internal `Pool` with `max: 1`, `connect()`s a client for each check, runs `client.query(query)`, then `release()`s the client.

```ts
import { createHealthKit } from "healthzkit";
import { pgAdapter } from "@healthzkit/postgres";

const kit = createHealthKit({
  checks: [
    {
      name: "postgres",
      type: ["readiness"],
      adapter: pgAdapter({
        connectionString: process.env.DATABASE_URL!,
      }),
    },
  ],
});
```

### Existing client or pool

Pass `client` as:

- A `Pool`: each check calls `pool.connect()`, runs the query on the `PoolClient`, then releases it.
- A `PoolClient` or other `ClientBase`: the query runs on that instance; release is a no-op.

```ts
import { Pool } from "pg";
import { pgAdapter } from "@healthzkit/postgres/pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

const adapter = pgAdapter({
  client: pool,
  query: "SELECT current_database()",
});
```

## `postgresJsAdapter` (`postgres`)

**Peer:** `postgres` ≥ 3.

### Connection string

The adapter dynamically imports `postgres`, then creates a shared `sql` instance with `{ max: 1 }`.

```ts
import { postgresJsAdapter } from "@healthzkit/postgres/postgres";

const adapter = postgresJsAdapter({
  connectionString: process.env.DATABASE_URL!,
});
```

The check runs `sql.unsafe(query)` (default `SELECT 1`). Use only trusted query strings (your own literals or constants).

### Existing client

Pass `client` as an existing `Sql` (or `TransactionSql`) instance from your app; no internal pool is created.

```ts
import postgres from "postgres";
import { postgresJsAdapter } from "@healthzkit/postgres";

const sql = postgres(process.env.DATABASE_URL!);

const adapter = postgresJsAdapter({
  client: sql,
  metadata: async () => ({ endpoint: "primary" }),
});
```

## Scheduling

For busy databases, pair these adapters with a `schedule` on the check so readiness reads cached results instead of hitting the database on every probe. See the **Scheduling** section in the `healthzkit` README.

## Development

From the monorepo root:

```bash
vp install
vp test --filter @healthzkit/postgres
vp pack --filter @healthzkit/postgres
```
