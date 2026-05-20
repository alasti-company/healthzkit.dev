# SQLite adapters (`@healthzkit/sqlite`)

The **`@healthzkit/sqlite`** package provides [`HealthAdapter`](./checks-and-adapters.md) helpers for **`better-sqlite3`** (synchronous), **`sqlite3`** (callback driver), and **`@libsql/client`** (libSQL / Turso). Successful checks run a lightweight SQL probe (default **`SELECT 1`**) and return **`ok`** with `metadata.latencyMs` plus any fields from an optional **`metadata`** hook; failures return **`fail`** with the caught error.

Install the adapter package and **one** database client:

```bash
pnpm add @healthzkit/sqlite healthzkit
# plus one of:
pnpm add better-sqlite3
pnpm add sqlite3
pnpm add @libsql/client
```

All drivers are optional peers—install only the one you use.

## Package entrypoints

- **`@healthzkit/sqlite`** — `betterSqlite3Adapter`, `sqlite3Adapter`, `libsqlAdapter`, and their option types.
- **`@healthzkit/sqlite/better-sqlite3`** — `betterSqlite3Adapter` only.
- **`@healthzkit/sqlite/sqlite3`** — `sqlite3Adapter` only.
- **`@healthzkit/sqlite/libsql`** — `libsqlAdapter` only.

Use subpath imports when you want to avoid pulling unused drivers into your bundle analysis path.

## Shared options

Every factory accepts `BaseSqliteOptions`:

| Option         | Description                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| **`query`**    | SQL executed for the probe. Default **`SELECT 1`**.                                                   |
| **`metadata`** | Optional `(client) => Record<string, unknown>` (sync or async) merged into metadata with `latencyMs`. |

Pass either connection credentials or an existing **`client`** (not both). The shape depends on the adapter (see below).

## `betterSqlite3Adapter` (`better-sqlite3`)

**Peer:** `better-sqlite3` ≥ 12.

Runs **`client.prepare(query).get()`** and records round-trip latency. Best for embedded SQLite in the same process.

### Connection string

Pass **`connectionString`**. The adapter lazily imports **`better-sqlite3`**, opens the database once, and reuses it across checks.

```ts
import { createHealthKit } from "healthzkit";
import { betterSqlite3Adapter } from "@healthzkit/sqlite";

const kit = createHealthKit({
  checks: [
    {
      name: "sqlite",
      type: ["readiness"],
      adapter: betterSqlite3Adapter({
        connectionString: process.env.SQLITE_PATH ?? ":memory:",
        options: { readonly: true },
      }),
    },
  ],
});
```

`connectionString` is a file path (for example `./data/app.db`) or **`:memory:`**.

### Existing client

```ts
import Database from "better-sqlite3";
import { betterSqlite3Adapter } from "@healthzkit/sqlite/better-sqlite3";

const db = new Database("app.db");

const adapter = betterSqlite3Adapter({
  client: db,
  query: "SELECT sqlite_version()",
  metadata: (client) => ({ path: "app.db" }),
});
```

## `sqlite3Adapter` (`sqlite3`)

**Peer:** `sqlite3` ≥ 5 or ≥ 6.

Uses the classic callback API: **`client.get(query, callback)`**. Suitable when you already depend on **`node-sqlite3`**.

### Connection string

Pass **`connectionString`**. The adapter opens the database via **`new sqlite3.Database(connectionString, mode, callback)`** and caches the handle. Default open mode is **`OPEN_READWRITE | OPEN_CREATE`**.

```ts
import { sqlite3Adapter } from "@healthzkit/sqlite/sqlite3";

const adapter = sqlite3Adapter({
  connectionString: "./data/app.db",
  mode: undefined, // optional; defaults to read/write + create
});
```

### Existing client

```ts
import sqlite3 from "sqlite3";
import { sqlite3Adapter } from "@healthzkit/sqlite";

const db = new sqlite3.Database(":memory:");

const adapter = sqlite3Adapter({ client: db });
```

## `libsqlAdapter` (`@libsql/client`)

**Peer:** `@libsql/client` ≥ 0.14.

Runs **`await client.execute(query)`**. Use for [libSQL](https://github.com/tursodatabase/libsql) and [Turso](https://turso.tech/) (`libsql://`, `https://`, file URLs, and so on).

### URL and token

Pass **`url`** (and optional **`authToken`**). The adapter lazily imports **`@libsql/client`**, calls **`createClient`** once, and reuses the client across checks.

```ts
import { libsqlAdapter } from "@healthzkit/sqlite/libsql";

const adapter = libsqlAdapter({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
```

### Existing client

```ts
import { createClient } from "@libsql/client";
import { libsqlAdapter } from "@healthzkit/sqlite";

const client = createClient({ url: "file:local.db" });

const adapter = libsqlAdapter({
  client,
  metadata: async () => ({ backend: "libsql" }),
});
```

## Scheduling

For databases that should not be queried on every probe, pair these adapters with a **`schedule`** on the check so readiness reads cached results (see [Scheduling](./scheduling.md)).
