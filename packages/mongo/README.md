# @healthzkit/mongo

MongoDB **healthzkit** `HealthAdapter` helpers for the official **[`mongodb`](https://www.mongodb.com/docs/drivers/node/current/)** driver and **[`mongoose`](https://mongoosejs.com/)**. Successful checks run an admin **`ping`** and return `ok` with `metadata.latencyMs` plus any fields from an optional `metadata` hook; failures return `fail` with the caught error.

## Install

```bash
npm install @healthzkit/mongo healthzkit
# plus one of:
npm install mongodb
npm install mongoose
```

`mongodb` and `mongoose` are optional peers—install the driver you use.

## Package entrypoints

| Import                       | Exports                                        |
| ---------------------------- | ---------------------------------------------- |
| `@healthzkit/mongo`          | `mongodbAdapter`, `mongooseAdapter`, and types |
| `@healthzkit/mongo/mongodb`  | `mongodbAdapter` only                          |
| `@healthzkit/mongo/mongoose` | `mongooseAdapter` only                         |

Use subpath imports when you want to avoid pulling both drivers into your bundle analysis path.

## Shared options

Both factories accept `BaseMongoOptions`:

| Option     | Description                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `metadata` | Optional async `(client) => Record<string, unknown>` merged into check metadata with `latencyMs`. |

Pass either `connectionString` or an existing client/connection (not both).

## `mongodbAdapter` (`mongodb`)

**Peer:** `mongodb` ≥ 6 or ≥ 7.

Each check runs `client.db("admin").command({ ping: 1 })` and records round-trip latency.

### Connection string

The adapter lazily imports `mongodb`, creates a shared `MongoClient`, and connects once. Concurrent checks reuse the same client. Call **`close()`** on the adapter when you created it via `connectionString` to shut down the internal client (no-op for injected clients).

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

// optional: on process shutdown when using connectionString
await adapter.close();
```

### Existing client

Pass **`client`** as an existing `MongoClient`. The adapter calls **`connect()`** once and reuses that client across checks. **`close()`** does not close an injected client.

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

**Peer:** `mongoose` ≥ 8 or ≥ 9.

Each check runs `db.admin().command({ ping: 1 })` on the resolved connection. Works with a **`Mongoose`** instance (`conn.connection.db`) or a mongoose **`Connection`** (`conn.db`).

### Connection string

The adapter dynamically imports `mongoose`, calls **`mongoose.connect(connectionString, mongooseOptions)`** once, and reuses that instance.

```ts
import { mongooseAdapter } from "@healthzkit/mongo/mongoose";

const adapter = mongooseAdapter({
  connectionString: process.env.MONGODB_URI!,
  mongooseOptions: { serverSelectionTimeoutMS: 2000 },
});
```

### Existing connection

Pass **`connection`** as your app's `mongoose` instance or a `Connection`. If **`readyState`** is not `1` (connected), the adapter awaits **`connection.asPromise()`** before pinging.

```ts
import mongoose from "mongoose";
import { mongooseAdapter } from "@healthzkit/mongo";

await mongoose.connect(process.env.MONGODB_URI!);

const adapter = mongooseAdapter({
  connection: mongoose,
  metadata: async () => ({ driver: "mongoose" }),
});
```

## Check result

On success:

```json
{
  "status": "ok",
  "metadata": { "latencyMs": 8 }
}
```

On failure, `status` is `"fail"` and `error` is set (see [healthzkit](https://github.com/alasti-company/healthzkit) for how that rolls up into probe responses).

## Scheduling

For busy clusters, pair these adapters with a **`schedule`** on the check so readiness reads cached results instead of pinging MongoDB on every probe. See the **Scheduling** section in the `healthzkit` README.

## Development

From the monorepo root:

```bash
vp install
vp test --filter @healthzkit/mongo
vp pack --filter @healthzkit/mongo
```
