# MongoDB adapters (`@healthzkit/mongo`)

The **`@healthzkit/mongo`** package provides [`HealthAdapter`](/guide/checks-and-adapters) helpers for the official **`mongodb`** driver and **`mongoose`**. Successful checks run an admin **`ping`** and return **`ok`** with `metadata.latencyMs` plus any fields from an optional **`metadata`** hook; failures return **`fail`** with the caught error.

Install the adapter package and **one** client library:

```bash
pnpm add @healthzkit/mongo
# plus one of:
pnpm add mongodb
pnpm add mongoose
```

`mongodb` and `mongoose` are optional peers-install the driver you use.

## Package entrypoints

- **`@healthzkit/mongo`** - `mongodbAdapter`, `mongooseAdapter`, and their option types.
- **`@healthzkit/mongo/mongodb`** - `mongodbAdapter` only.
- **`@healthzkit/mongo/mongoose`** - `mongooseAdapter` only.

Use subpath imports when you want to avoid pulling both drivers into your bundle analysis path.

## Shared options

Both factories share `BaseMongoOptions`:

| Option         | Description                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------- |
| **`metadata`** | Optional async `(client) => Record<string, unknown>` merged into check metadata with `latencyMs`. |

## `mongodbAdapter` (`mongodb`)

**Peer:** `mongodb` >= 6 or >= 7.

Each check runs **`client.db("admin").command({ ping: 1 })`** and records round-trip latency.

### Connection string

Pass **`connectionString`** (and optional **`mongoOptions`**). The adapter lazily imports **`mongodb`**, creates a shared **`MongoClient`**, and connects once. Concurrent checks reuse the same client.

Call **`adapter.close()`** when the adapter owns the client (created from `connectionString`) to shut down the internal connection. **`close()`** is a no-op when you pass an existing **`client`**.

```ts
import { createHealthKit } from "healthzkit";
import { mongodbAdapter } from "@healthzkit/mongo";

const adapter = mongodbAdapter({
  connectionString: process.env.MONGODB_URI!,
  mongoOptions: { serverSelectionTimeoutMS: 2000 },
});

const kit = createHealthKit({
  checks: [
    {
      name: "mongodb",
      type: ["readiness"],
      adapter,
    },
  ],
});
```

### Existing client

Pass **`client`** as an existing **`MongoClient`**. The adapter calls **`connect()`** once and reuses that client across checks.

```ts
import { MongoClient } from "mongodb";
import { mongodbAdapter } from "@healthzkit/mongo/mongodb";

const client = new MongoClient(process.env.MONGODB_URI!);

const adapter = mongodbAdapter({
  client,
  metadata: async (c) => {
    const hello = await c.db("admin").command({ hello: 1 });
    return { setName: hello.setName };
  },
});
```

## `mongooseAdapter` (`mongoose`)

**Peer:** `mongoose` >= 8 or >= 9.

Each check runs **`db.admin().command({ ping: 1 })`** on the resolved connection. The adapter supports a **`Mongoose`** instance (`conn.db`) or a mongoose **`Connection`** (`conn.connection.db`).

### Connection string

Pass **`connectionString`** (and optional **`mongooseOptions`**). The adapter dynamically imports **`mongoose`**, calls **`mongoose.connect()`** once, and reuses that instance.

```ts
import { mongooseAdapter } from "@healthzkit/mongo/mongoose";

const adapter = mongooseAdapter({
  connectionString: process.env.MONGODB_URI!,
});
```

### Existing connection

Pass **`connection`** as your app's **`mongoose`** instance or a **`Connection`**. If **`readyState`** is not **`1`** (connected), the adapter awaits **`connection.asPromise()`** before pinging.

```ts
import mongoose from "mongoose";
import { mongooseAdapter } from "@healthzkit/mongo";

await mongoose.connect(process.env.MONGODB_URI!);

const adapter = mongooseAdapter({
  connection: mongoose,
  metadata: async () => ({ driver: "mongoose" }),
});
```

## Wiring into `createHealthKit`

Treat each factory's return value as **`adapter`** on a check (same as a hand-written `{ check() { ... } }` object):

```ts
adapter: mongodbAdapter({ client: myMongoClient }),
```

Combine with **`schedule`** on the check if you want cached readiness results instead of pinging MongoDB on every probe (see [Scheduling](/guide/scheduling)).
