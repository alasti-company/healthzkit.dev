# @healthzkit/drizzle

[Drizzle ORM](https://orm.drizzle.team/) **healthzkit** `HealthAdapter` helper. Successful checks run a lightweight SQL probe (default **`SELECT 1`**) through the Drizzle instance you already use in your app—via **`execute`** (Postgres, MySQL) or **`run`** (SQLite)—and return `ok` with `metadata.latencyMs` plus any fields from an optional `metadata` hook; failures return `fail` with the caught error.

This package depends only on **`drizzle-orm`**. Database drivers (`pg`, `mysql2`, `better-sqlite3`, and so on) stay in the application package that creates the Drizzle instance; the adapter does not require them as peers.

## Install

```bash
npm install @healthzkit/drizzle healthzkit drizzle-orm
```

Your app still installs whichever driver you use with Drizzle (for example `pg` or `mysql2`). The health adapter only needs the shared **`db`** instance.

## Package entrypoints

| Import                        | Exports                                                      |
| ----------------------------- | ------------------------------------------------------------ |
| `@healthzkit/drizzle`         | `drizzleAdapter`, `extractClient`, `detectDriver`, and types |
| `@healthzkit/drizzle/drizzle` | `drizzleAdapter` only                                        |
| `@healthzkit/drizzle/extract` | `extractClient`, `detectDriver`, and types                   |

## Options

`drizzleAdapter` accepts:

| Option     | Description                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `db`       | Your Drizzle database instance (`PgDatabase`, `MySqlDatabase`, or `BaseSQLiteDatabase`). **Required.**                                       |
| `driver`   | Override auto-detected driver: `"pg"`, `"mysql"`, or `"sqlite"`. Use when session introspection is ambiguous or you want an explicit probe.  |
| `query`    | SQL string for the probe. Default **`SELECT 1`**.                                                                                            |
| `metadata` | Optional `(client) => Record<string, unknown>` (sync or async). Receives the underlying driver client from `db.session.client` when present. |

For typed `metadata`, pass a second generic at the call site (your app already has the driver types):

```ts
import type { Pool } from "pg";
import { drizzleAdapter } from "@healthzkit/drizzle";

const adapter = drizzleAdapter<typeof db, Pool>({
  db,
  metadata: (client) => ({ totalCount: client.totalCount }),
});
```

## Usage

Pass the same `db` you use for queries elsewhere in the service:

```ts
import { createHealthKit } from "healthzkit";
import { drizzleAdapter } from "@healthzkit/drizzle";
import { db } from "./db.ts";

const kit = createHealthKit({
  checks: [
    {
      name: "database",
      type: ["readiness"],
      adapter: drizzleAdapter({ db }),
    },
  ],
});
```

### Driver override

Auto-detection inspects Drizzle’s internal session shape. Override when you know the dialect:

```ts
drizzleAdapter({
  db,
  driver: "mysql",
  query: "SELECT 1",
});
```

### Subpath import

```ts
import { drizzleAdapter } from "@healthzkit/drizzle/drizzle";
```

## Helpers

- **`detectDriver(db)`** — returns `"pg"`, `"mysql"`, `"sqlite"`, or `"unknown"` from the session layout.
- **`extractClient(db)`** — returns `db.session.client` as `unknown` (opaque; type it in your app if needed for `metadata`).

## Check result

On success:

```json
{
  "status": "ok",
  "metadata": { "latencyMs": 12 }
}
```

On failure, `status` is `"fail"` and `error` is set (see [healthzkit](https://github.com/alasti-company/healthzkit) for how that rolls up into probe responses).

## Scheduling

For databases that should not be queried on every probe, pair this adapter with a **`schedule`** on the check so readiness reads cached results. See the **Scheduling** section in the `healthzkit` README.

## Development

From the monorepo root:

```bash
vp install
vp test --filter @healthzkit/drizzle
vp pack --filter @healthzkit/drizzle
```

See the repo root `AGENTS.md` for Vite+ / `vp` conventions.
