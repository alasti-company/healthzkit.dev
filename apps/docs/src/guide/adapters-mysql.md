# MySQL adapters (`@healthzkit/mysql`)

The **`@healthzkit/mysql`** package provides [`HealthAdapter`](./checks-and-adapters.md) helpers for **`mysql`** (callback driver) and **`mysql2`** (promise API). Successful checks run a lightweight SQL probe (default **`SELECT 1`**) and return **`ok`** with `metadata.latencyMs` plus any fields from an optional **`metadata`** hook; failures return **`fail`** with the caught error.

Install the adapter package and **one** database client:

```bash
pnpm add @healthzkit/mysql
# plus one of:
pnpm add mysql
pnpm add mysql2
```

`mysql` and `mysql2` are optional peers—install the driver you use.

## Package entrypoints

- **`@healthzkit/mysql`** — `mysqlAdapter`, `mysql2Adapter`, and their option types.
- **`@healthzkit/mysql/mysql`** — `mysqlAdapter` only.
- **`@healthzkit/mysql/mysql2`** — `mysql2Adapter` only.

Use subpath imports when you want to avoid pulling both drivers into your bundle analysis path.

## Shared options

Both factories share `BaseMysqlOptions`:

| Option         | Description                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------- |
| **`query`**    | SQL string executed for the probe. Default **`SELECT 1`**.                                        |
| **`metadata`** | Optional async `(client) => Record<string, unknown>` merged into check metadata with `latencyMs`. |

Pass either **`connectionString`** or **`client`** (not both).

## `mysqlAdapter` (`mysql`)

**Peer:** `mysql` ≥ 2.18.

Each check acquires a connection, runs **`connection.query(query)`**, records round-trip latency, and **`release()`**s pooled connections in a **`finally`** block.

### Connection string

Pass **`connectionString`** (and optional **`connectionOptions`** for extra pool settings). The adapter lazily imports **`mysql`**, parses a **`mysql://`** or **`mysql2://`** URL, and creates a shared internal **`Pool`**. Concurrent checks reuse that pool.

```ts
import { createHealthKit } from "healthzkit";
import { mysqlAdapter } from "@healthzkit/mysql";

const kit = createHealthKit({
  checks: [
    {
      name: "mysql",
      type: ["readiness"],
      adapter: mysqlAdapter({
        connectionString: process.env.DATABASE_URL!,
        connectionOptions: { connectTimeout: 2000 },
      }),
    },
  ],
});
```

### Existing client or pool

Pass **`client`** as:

- A **`Pool`**: each check calls **`pool.getConnection()`**, runs the query, then releases the connection.
- A **`Connection`**: the query runs on that instance; release is a no-op when the connection has no **`release`** method.

```ts
import mysql from "mysql";
import { mysqlAdapter } from "@healthzkit/mysql/mysql";

const pool = mysql.createPool({
  host: "localhost",
  user: "app",
  database: "app",
});

const adapter = mysqlAdapter({
  client: pool,
  query: "SELECT VERSION()",
});
```

## `mysql2Adapter` (`mysql2`)

**Peer:** `mysql2` ≥ 3.

Uses the promise API from **`mysql2/promise`**. Each check acquires a connection, awaits **`connection.query(query)`**, records latency, and releases pooled connections when applicable.

### Connection string

Pass **`connectionString`** and **`connectionOptions`** (`PoolOptions` merged into the internal pool). The adapter lazily imports **`mysql2/promise`**, parses **`mysql://`** or **`mysql2://`** URLs, and reuses one internal pool across checks.

```ts
import { mysql2Adapter } from "@healthzkit/mysql/mysql2";

const adapter = mysql2Adapter({
  connectionString: process.env.DATABASE_URL!,
  connectionOptions: { connectionLimit: 2 },
});
```

### Existing client or pool

Pass **`client`** as a **`Pool`** or **`Connection`** from your app.

```ts
import mysql from "mysql2/promise";
import { mysql2Adapter } from "@healthzkit/mysql";

const pool = mysql.createPool(process.env.DATABASE_URL!);

const adapter = mysql2Adapter({
  client: pool,
  metadata: async () => ({ driver: "mysql2" }),
});
```

## Connection strings

Both adapters accept URLs with the **`mysql://`** or **`mysql2://`** scheme (default port **3306**). Userinfo and database name come from the URL; additional pool settings go in **`connectionOptions`**.

```text
mysql://user:pass@db.example:3306/myapp
mysql2://localhost:3307/myapp

```

## Scheduling

For busy databases, pair these adapters with a **`schedule`** on the check so readiness reads cached results (see [Scheduling](./scheduling.md)).
