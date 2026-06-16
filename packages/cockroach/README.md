# @healthzkit/cockroach

CockroachDB **healthzkit** `HealthAdapter` helper for **[`pg`](https://node-postgres.com/)** (node-postgres). CockroachDB speaks the PostgreSQL wire protocol, so the adapter runs a lightweight SQL probe (default **`SELECT 1`**) via `client.query`. Successful checks return `ok` with `metadata.latencyMs` plus any fields from an optional `metadata` hook; failures return `fail` with the caught error.

## Install

```bash
npm install @healthzkit/cockroach healthzkit pg
```

**Peer:** `pg` ≥ 8.

## Options

`cockroachPgAdapter` accepts `BaseCockroachOptions`:

| Option     | Description                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `query`    | SQL executed for the probe. Default `SELECT 1`.                                                   |
| `metadata` | Optional async `(client) => Record<string, unknown>` merged into check metadata with `latencyMs`. |

Pass either `connectionString` or `client` (not both).

## Connection string

The adapter maintains an internal `Pool` with `max: 1`, `connect()`s a client for each check, runs `client.query(query)`, then `release()`s the client in a `finally` block.

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
      }),
    },
  ],
});
```

Optional `pgOption` merges into the internal `Pool` constructor (everything except `connectionString`).

## Existing client or pool

Pass `client` as:

- A `Pool`: each check calls `pool.connect()`, runs the query on the `PoolClient`, then releases it.
- A `PoolClient` or other `ClientBase`: the query runs on that instance; release is a no-op.

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

For busy clusters, pair this adapter with a `schedule` on the check so readiness reads cached results instead of hitting CockroachDB on every probe. See the **Scheduling** section in the `healthzkit` README.

## Development

From the monorepo root:

```bash
vp install
vp test --filter @healthzkit/cockroach
vp pack --filter @healthzkit/cockroach
```
