# Postgres adapters (`@healthzkit/postgres`)

The **`@healthzkit/postgres`** package provides [`HealthAdapter`](./checks-and-adapters.md) helpers for **`pg`** (node-postgres) and **`postgres`** (Postgres.js). Successful checks return **`ok`** with `metadata.latencyMs` plus any fields from an optional **`metadata`** hook; failures return **`fail`** with the caught error.

Install the adapter package and **one** database client:

```bash
pnpm add @healthzkit/postgres
# plus one of:
pnpm add pg
pnpm add postgres
```

`pg` and `postgres` are optional peers—install the driver you use.

## Package entrypoints

- **`@healthzkit/postgres`** — `pgAdapter`, `postgresJsAdapter`, and their option types (convenient when you use both or want a single import).
- **`@healthzkit/postgres/pg`** — `pgAdapter` only.
- **`@healthzkit/postgres/postgres`** — `postgresJsAdapter` only.

Use subpath imports when you want to avoid pulling both drivers into your bundle analysis path.

## Shared options

Both factories share `BasePostgresOptions`:

| Option         | Description                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------- |
| **`query`**    | SQL string executed for the probe. Default **`SELECT 1`**.                                        |
| **`metadata`** | Optional async `(client) => Record<string, unknown>` merged into check metadata with `latencyMs`. |

## `pgAdapter` (`pg`)

**Peer:** `pg` ≥ 8.

### Connection string

Pass **`connectionString`**. The adapter maintains an internal **`Pool`** with **`max: 1`**, **`connect()`**s a client for each check, runs **`client.query(query)`**, then **`release()`**s the client in a **`finally`** block.

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
        query: "SELECT 1",
      }),
    },
  ],
});
```

### Existing client or pool

Pass **`client`** as:

- A **`Pool`**: each check calls **`pool.connect()`**, runs the query on the **`PoolClient`**, then releases it.
- A **`PoolClient`** or other **`ClientBase`**: the query runs on that instance; release is a no-op.

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

Pass **`connectionString`**. The adapter dynamically imports **`postgres`**, then creates a shared **`sql`** instance with **`{ max: 1 }`**.

```ts
import { postgresJsAdapter } from "@healthzkit/postgres/postgres";

const adapter = postgresJsAdapter({
  connectionString: process.env.DATABASE_URL!,
});
```

The check runs **`sql.unsafe(query)`** (default `SELECT 1`). Use only trusted query strings (your own literals or constants).

### Existing client

Pass **`client`** as an existing **`Sql`** (or **`TransactionSql`**) instance from your app; no internal pool is created.

```ts
import postgres from "postgres";
import { postgresJsAdapter } from "@healthzkit/postgres";

const sql = postgres(process.env.DATABASE_URL!);

const adapter = postgresJsAdapter({
  client: sql,
  metadata: async (s) => ({ endpoint: "primary" }),
});
```

## Scheduling

For busy databases, pair these adapters with a **`schedule`** on the check so readiness reads cached results (see [Scheduling](./scheduling.md)).
