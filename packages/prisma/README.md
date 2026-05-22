# @healthzkit/prisma

[Prisma](https://www.prisma.io/) **healthzkit** `HealthAdapter` helper. Successful checks call **`$connect()`** on your existing **`PrismaClient`**, run a lightweight SQL probe (default **`SELECT 1`**) via **`$queryRawUnsafe`**, and return `ok` with `metadata.latencyMs` plus any fields from an optional `metadata` hook; failures return `fail` with the caught error.

The adapter does not create a client or read `DATABASE_URL` for you—pass the same **`PrismaClient`** instance your application already uses.

## Install

```bash
npm install @healthzkit/prisma healthzkit @prisma/client
```

**Peer:** `@prisma/client` ≥ 7.

Database drivers stay in your application (Prisma’s generator and datasource configuration); this package only peers on `@prisma/client`.

## Package entrypoints

| Import                      | Exports                          |
| --------------------------- | -------------------------------- |
| `@healthzkit/prisma`        | `prismaAdapter` and option types |
| `@healthzkit/prisma/prisma` | `prismaAdapter` only             |

Use the subpath when you want a minimal import surface.

## Options

`prismaAdapter` accepts:

| Option     | Description                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| `client`   | Your `PrismaClient` instance. **Required.**                                                           |
| `query`    | SQL executed for the probe. Default `SELECT 1`.                                                       |
| `metadata` | Optional `(client) => Record<string, unknown>` (sync or async) merged into metadata with `latencyMs`. |

The probe uses **`$queryRawUnsafe`**. Use only trusted query strings (your own literals or constants).

## Basic usage

Pass the same client your service uses for application queries:

```ts
import { createHealthKit } from "healthzkit";
import { prismaAdapter } from "@healthzkit/prisma";
import { prisma } from "./db.ts";

const kit = createHealthKit({
  checks: [
    {
      name: "database",
      type: ["readiness"],
      adapter: prismaAdapter({ client: prisma }),
    },
  ],
});
```

## Custom query and metadata

```ts
import { prismaAdapter } from "@healthzkit/prisma/prisma";

const adapter = prismaAdapter({
  client: prisma,
  query: "SELECT current_database()",
  metadata: async (client) => {
    const [{ version }] = await client.$queryRawUnsafe<{ version: string }[]>("SELECT version()");
    return { version };
  },
});
```

## When to use this vs other adapters

| Situation                                 | Suggestion                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| App already uses Prisma for all DB access | **`@healthzkit/prisma`** — pass **`client`**, no second connection                                           |
| App uses Drizzle ORM                      | [`@healthzkit/drizzle`](../drizzle) — pass your existing **`db`** instance                                   |
| Raw `pg` / `mysql2` pool without ORM      | [`@healthzkit/postgres`](../postgres), [`@healthzkit/mysql`](../mysql), or [`@healthzkit/sqlite`](../sqlite) |

## Scheduling

For busy databases, pair this adapter with a `schedule` on the check so readiness reads cached results instead of hitting the database on every probe. See the **Scheduling** section in the `healthzkit` README.

## Development

From the monorepo root:

```bash
vp install
vp test --filter @healthzkit/prisma
vp pack --filter @healthzkit/prisma
```
