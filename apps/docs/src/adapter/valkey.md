---
title: Valkey adapter
description: Use @healthzkit/valkey adapters for iovalkey and Valkey GLIDE—ping-based readiness checks, latency metadata, connection-string parsing, and Healthzkit registration examples.
---

# Valkey adapters (`@healthzkit/valkey`)

The **`@healthzkit/valkey`** package ships ready-made [`HealthAdapter`](/guide/checks-and-adapters) implementations for common [Valkey](https://valkey.io/) Node.js clients. Each adapter measures round-trip latency, returns **`ok`** with `metadata.latencyMs` (and any extra fields from an optional hook), or **`fail`** with the caught error.

Install the adapter package and **at least one** peer client library:

```bash
pnpm add @healthzkit/valkey
# plus one of:
pnpm add iovalkey
pnpm add @valkey/valkey-glide
```

Both clients are optional peers: install only the stack you use.

## Shared options

Every factory accepts a small common shape (see `BaseValkeyOptions` in the package):

| Option         | Description                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| **`command`**  | Valkey command to run. Default **`PING`**. How the string is sent depends on the client (see below).       |
| **`metadata`** | Optional async `(client) => Record<string, unknown>` merged into the check metadata alongside `latencyMs`. |

## `iovalkeyAdapter`

**Peer:** `iovalkey` >= 0.3.

Use either a **shared `Redis` instance** or a **connection string** (the adapter lazily creates an internal client with `maxRetriesPerRequest: 1` and `enableReadyCheck: false`, merged with your `options`).

```ts
import { createHealthKit } from "healthzkit";
import { iovalkeyAdapter } from "@healthzkit/valkey/iovalkey";

const kit = createHealthKit({
  checks: [
    {
      name: "valkey",
      type: ["readiness"],
      adapter: iovalkeyAdapter({
        connectionString: process.env.VALKEY_URL!,
        command: "PING",
      }),
    },
  ],
});
```

The command string is passed to iovalkey **`client.call(...)`** as a single string (for example `"PING"` or `"ECHO x"`).

## `glideValkeyAdapter` (Valkey GLIDE)

**Peer:** `@valkey/valkey-glide` >= 1.

Use a **`GlideClient` instance** (with `customCommand`) or a **connection string**. For connection strings, the adapter parses `redis://`, `rediss://`, `valkey://`, and `valkeys://` URLs into `GlideClientConfiguration`, then calls **`GlideClient.createClient`** once and reuses the client.

```ts
import { glideValkeyAdapter } from "@healthzkit/valkey/valkey-glide";

const adapter = glideValkeyAdapter({
  connectionString: process.env.VALKEY_URL!,
  options: { requestTimeout: 5000 },
});
```

- **`rediss://`** and **`valkeys://`** enable TLS (default port **6380** when omitted).
- **`redis://`** and **`valkey://`** use plain TCP (default port **6379** when omitted).
- URL credentials map to `credentials.username` / `credentials.password`.
- A path such as `/2` sets `databaseId`.

The `command` string is split on whitespace and passed to **`customCommand` as an argv array** (default `["PING"]`; custom example `"ECHO hello"` → `["ECHO", "hello"]`).

## Subpath imports

Import only the client you install so unused peers are not pulled in:

| Client       | Import                            | Adapter              |
| ------------ | --------------------------------- | -------------------- |
| iovalkey     | `@healthzkit/valkey/iovalkey`     | `iovalkeyAdapter`    |
| Valkey GLIDE | `@healthzkit/valkey/valkey-glide` | `glideValkeyAdapter` |

All adapters are also re-exported from `@healthzkit/valkey`.

## Wiring into `createHealthKit`

Treat each factory's return value as **`adapter`** on a check (same as a hand-written `{ check() { ... } }` object):

```ts
adapter: iovalkeyAdapter({ client: myValkey }),
```

Combine with **`schedule`** on the check if you want cached readiness results instead of hitting Valkey on every probe (see [Scheduling](/guide/scheduling)).
