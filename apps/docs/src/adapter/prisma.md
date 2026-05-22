---
title: Prisma adapter
description: Use @healthzkit/prisma to health-check an existing PrismaClient—$connect and $queryRawUnsafe SQL probes, optional metadata hooks, and no extra driver peer dependencies on the adapter package.
---

# Prisma adapter (`@healthzkit/prisma`)

The **`@healthzkit/prisma`** package provides a [`HealthAdapter`](/guide/checks-and-adapters) for an existing **[Prisma](https://www.prisma.io/)** **`PrismaClient`**. Each check calls **`$connect()`**, runs a lightweight SQL probe (default **`SELECT 1`**) via **`$queryRawUnsafe`**, and returns **`ok`** with `metadata.latencyMs` plus any fields from an optional **`metadata`** hook; failures return **`fail`** with the caught error.

Install the adapter package and **`@prisma/client`** (your app already has both if you use Prisma):

```bash
pnpm add @healthzkit/prisma @prisma/client
```

**Drivers stay in your app.** This package peers only on **`@prisma/client`**. The probe uses the client you pass in; datasource URLs and driver packages remain in the application that constructs **`PrismaClient`**.

## Package entrypoints

- **`@healthzkit/prisma`** — `prismaAdapter` and option types.
- **`@healthzkit/prisma/prisma`** — `prismaAdapter` only.

## Options

| Option         | Description                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **`client`**   | Your `PrismaClient` instance. **Required.**                                                                                         |
| **`query`**    | SQL for the probe. Default **`SELECT 1`**. Executed with **`$queryRawUnsafe`**—use only trusted query strings.                      |
| **`metadata`** | Optional `(client) => Record<string, unknown>` (sync or async). Receives the same **`PrismaClient`** passed to **`prismaAdapter`**. |

## Basic usage

Pass the same **`PrismaClient`** your service uses for application queries:

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
    const rows = await client.$queryRawUnsafe<{ version: string }[]>("SELECT version()");
    return { version: rows[0]?.version };
  },
});
```

## When to use this vs other adapters

| Situation                                 | Suggestion                                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| App already uses Prisma for all DB access | **`@healthzkit/prisma`** — pass **`client`**, no second connection                                                             |
| App uses Drizzle ORM                      | [`@healthzkit/drizzle`](/adapter/drizzle) — pass your existing **`db`** instance                                               |
| Raw `pg` / `mysql2` pool without ORM      | [`@healthzkit/postgres`](/adapter/postgres), [`@healthzkit/mysql`](/adapter/mysql), or [`@healthzkit/sqlite`](/adapter/sqlite) |

## Scheduling

For busy databases, pair this adapter with a **`schedule`** on the check so readiness reads cached results (see [Scheduling](/guide/scheduling)).
