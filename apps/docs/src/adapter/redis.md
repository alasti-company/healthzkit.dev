# Redis adapters (`@healthzkit/redis`)

The **`@healthzkit/redis`** package ships ready-made [`HealthAdapter`](/guide/checks-and-adapters) implementations for common Redis clients. Each adapter measures round-trip latency, returns **`ok`** with `metadata.latencyMs` (and any extra fields from an optional hook), or **`fail`** with the caught error.

Install the adapter package and **at least one** peer client library:

```bash
pnpm add @healthzkit/redis
# plus one of:
pnpm add ioredis
pnpm add redis
pnpm add @upstash/redis
```

All three clients are optional peers: install only the stack you use.

## Shared options

Every factory accepts a small common shape (see `BaseRedisOptions` in the package):

| Option         | Description                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| **`command`**  | Redis command to run. Default **`PING`**. How the string is sent depends on the client (see below).        |
| **`metadata`** | Optional async `(client) => Record<string, unknown>` merged into the check metadata alongside `latencyMs`. |

## `ioredisAdapter`

**Peer:** `ioredis` >= 5.

Use either a **shared `Redis` instance** or a **connection string** (the adapter lazily creates an internal client with `maxRetriesPerRequest: 1` and `enableReadyCheck: false`, merged with your `redisOptions`).

```ts
import { createHealthKit } from "healthzkit";
import { ioredisAdapter } from "@healthzkit/redis";

const kit = createHealthKit({
  checks: [
    {
      name: "redis",
      type: ["readiness"],
      adapter: ioredisAdapter({
        connectionString: process.env.REDIS_URL!,
        command: "PING",
      }),
    },
  ],
});
```

The command string is passed to ioredis **`client.call(...)`** as a single string (for example `"PING"` or `"ECHO x"`).

## `nodeRedisAdapter` (node-redis)

**Peer:** `redis` >= 4.

Use a **`createClient` instance** (with `sendCommand`, `connect`, `isOpen`) or a **connection string** (the adapter calls `createClient({ url, ...redisOptions })`, then `connect()` once).

```ts
import { nodeRedisAdapter } from "@healthzkit/redis";

const adapter = nodeRedisAdapter({
  connectionString: process.env.REDIS_URL!,
});
```

The `command` string is split on whitespace and passed to **`sendCommand` as an argv array** (default `["PING"]`; custom example `"ECHO hello"` -> `["ECHO", "hello"]`). If the client is not open, **`connect()`** is awaited before the command.

## `upstashAdapter`

**Peer:** `@upstash/redis` >= 1.

Use **`url` + `token`** (internal REST client is created lazily) or pass an existing **Upstash `Redis`** client.

```ts
import { upstashAdapter } from "@healthzkit/redis";

const adapter = upstashAdapter({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
```

- Default **`PING`** uses **`client.ping()`**.
- Any **other** `command` value is split into argv and sent with **`client.exec([cmd, ...args])`**. Setting `command` to exactly **`PING`** still uses **`ping()`**, not `exec`.

## Wiring into `createHealthKit`

Treat each factory's return value as **`adapter`** on a check (same as a hand-written `{ check() { ... } }` object):

```ts
adapter: ioredisAdapter({ client: myRedis }),
```

Combine with **`schedule`** on the check if you want cached readiness results instead of hitting Redis on every probe (see [Scheduling](/guide/scheduling)).
