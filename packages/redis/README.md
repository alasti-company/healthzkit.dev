# @healthzkit/redis

Redis health adapters for [healthzkit](https://github.com/alasti-company/healthzkit). Each adapter implements `HealthAdapter` by running a lightweight command (default **`PING`**) and returning latency in metadata.

Install the Redis client you use as a peer dependency; only that adapter’s subpath needs to be imported.

## Install

```bash
npm install healthzkit @healthzkit/redis
```

Pick one client (peer dependency):

```bash
npm install ioredis          # for @healthzkit/redis/ioredis
npm install redis            # for @healthzkit/redis/redis
npm install @upstash/redis   # for @healthzkit/redis/upstash
```

The package is ESM-only (`"type": "module"`).

## Quick start

```ts
import { createHealthKit } from "healthzkit";
import { ioredisAdapter } from "@healthzkit/redis/ioredis";

const kit = createHealthKit({
  checks: [
    {
      name: "redis",
      type: ["readiness"],
      adapter: ioredisAdapter({
        connectionString: process.env.REDIS_URL!,
      }),
    },
  ],
});
```

Use a subpath import so unused clients are not pulled in:

| Client                                                     | Import                      | Adapter            |
| ---------------------------------------------------------- | --------------------------- | ------------------ |
| [ioredis](https://github.com/redis/ioredis)                | `@healthzkit/redis/ioredis` | `ioredisAdapter`   |
| [node-redis](https://github.com/redis/node-redis)          | `@healthzkit/redis/redis`   | `nodeRedisAdapter` |
| [@upstash/redis](https://github.com/upstash/upstash-redis) | `@healthzkit/redis/upstash` | `upstashAdapter`   |

All adapters are also re-exported from `@healthzkit/redis` if you depend on multiple clients.

## Adapters

### ioredis

```ts
import { ioredisAdapter } from "@healthzkit/redis/ioredis";
import Redis from "ioredis";

// Connection string (creates and reuses an internal client)
ioredisAdapter({ connectionString: "redis://localhost:6379" });

// Existing client
ioredisAdapter({ client: new Redis(process.env.REDIS_URL!) });
```

### node-redis

```ts
import { nodeRedisAdapter } from "@healthzkit/redis/redis";
import { createClient } from "redis";

nodeRedisAdapter({ connectionString: "redis://localhost:6379" });

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();
nodeRedisAdapter({ client });
```

### Upstash

```ts
import { upstashAdapter } from "@healthzkit/redis/upstash";
import { Redis } from "@upstash/redis";

upstashAdapter({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

upstashAdapter({ client: Redis.fromEnv() });
```

## Options

Shared options on every adapter:

- **`command`** — Command to run. Default `"PING"`. For node-redis this is split on spaces and passed to `sendCommand` (e.g. `"ECHO x"`). For Upstash, non-`PING` commands use `exec` with parsed tokens.
- **`metadata`** — Optional `(client) => Promise<Record<string, unknown>>`. Merged into the check result with `latencyMs`.

Connection options (mutually exclusive per adapter):

| Adapter    | Create from credentials             | Use existing client |
| ---------- | ----------------------------------- | ------------------- |
| ioredis    | `connectionString`, `redisOptions?` | `client`            |
| node-redis | `connectionString`, `redisOptions?` | `client`            |
| Upstash    | `url`, `token`                      | `client`            |

## Check result

On success:

```json
{
  "status": "ok",
  "metadata": { "latencyMs": 12 }
}
```

On failure, `status` is `"fail"` and `error` is set (see [healthzkit](https://github.com/alasti-company/healthzkit) for how that rolls up into probe responses).

## Development (this repo)

From the package directory:

```bash
vp install
vp test
vp pack
```

See the repo root `AGENTS.md` for Vite+ / `vp` conventions.
