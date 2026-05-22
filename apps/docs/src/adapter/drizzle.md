---
title: Drizzle ORM adapter
description: Use @healthzkit/drizzle to health-check an existing Drizzle db instance—SQL probes via execute/run, optional driver override, typed metadata, and no extra driver peer dependencies on the adapter package.
---

# Drizzle ORM adapter (`@healthzkit/drizzle`)

The **`@healthzkit/drizzle`** package provides a [`HealthAdapter`](/guide/checks-and-adapters) for an existing **[Drizzle ORM](https://orm.drizzle.team/)** database instance. Successful checks run a lightweight SQL probe (default **`SELECT 1`**) through Drizzle—**`execute`** for Postgres and MySQL, **`run`** for SQLite—and return **`ok`** with `metadata.latencyMs` plus any fields from an optional **`metadata`** hook; failures return **`fail`** with the caught error.

Install the adapter package and **`drizzle-orm`** (your app already has both if you use Drizzle):

```bash
pnpm add @healthzkit/drizzle drizzle-orm
```

**Drivers stay in your app.** This package does not list `pg`, `mysql2`, or SQLite clients as peer dependencies. The probe uses Drizzle’s public API on the **`db`** you pass in; driver packages remain in the package that created the instance.

## Package entrypoints

- **`@healthzkit/drizzle`** — `drizzleAdapter`, `extractClient`, `detectDriver`, and option types.
- **`@healthzkit/drizzle/drizzle`** — `drizzleAdapter` only.
- **`@healthzkit/drizzle/extract`** — `extractClient`, `detectDriver`, and types.

## Options

| Option         | Description                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`db`**       | Your Drizzle instance (`PgDatabase`, `MySqlDatabase`, or `BaseSQLiteDatabase`). **Required.**                                                                             |
| **`driver`**   | Optional `"pg"`, `"mysql"`, or `"sqlite"` to override auto-detection from the session layout.                                                                             |
| **`query`**    | SQL for the probe. Default **`SELECT 1`**.                                                                                                                                |
| **`metadata`** | Optional `(client) => Record<string, unknown>` (sync or async). Uses `db.session.client` when available. Type **`client`** in your app with a second generic (see below). |

## Basic usage

Pass the same **`db`** your service uses for application queries:

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

## Driver override

The adapter can infer the dialect from Drizzle’s session (`query` for Postgres, `execute` for MySQL, `run` / `syncRun` for SQLite). Set **`driver`** when you want an explicit probe path:

```ts
import { drizzleAdapter } from "@healthzkit/drizzle/drizzle";

const adapter = drizzleAdapter({
  db,
  driver: "mysql",
  query: "SELECT 1",
});
```

## Typed metadata

The adapter does not import driver types. If you want a typed **`metadata`** callback, supply the client type from your application (where `pg`, `mysql2`, and so on are already installed):

```ts
import type { Pool } from "pg";
import { drizzleAdapter } from "@healthzkit/drizzle";

const adapter = drizzleAdapter<typeof db, Pool>({
  db,
  metadata: (client) => ({ totalCount: client.totalCount }),
});
```

## Helpers

- **`detectDriver(db)`** — `"pg" | "mysql" | "sqlite" | "unknown"`.
- **`extractClient(db)`** — underlying `session.client` as **`unknown`**.

Import from **`@healthzkit/drizzle`** or **`@healthzkit/drizzle/extract`**.

## When to use this vs driver adapters

| Situation                                  | Suggestion                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| App already uses Drizzle for all DB access | **`@healthzkit/drizzle`** — pass **`db`**, no second connection                                                                |
| Raw `pg` / `mysql2` pool without ORM       | [`@healthzkit/postgres`](/adapter/postgres), [`@healthzkit/mysql`](/adapter/mysql), or [`@healthzkit/sqlite`](/adapter/sqlite) |

## Scheduling

For busy databases, pair this adapter with a **`schedule`** on the check so readiness reads cached results (see [Scheduling](/guide/scheduling)).
