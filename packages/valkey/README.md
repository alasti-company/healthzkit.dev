# @healthzkit/valkey

Valkey health adapters for [healthzkit](https://github.com/alasti-company/healthzkit). Each adapter implements `HealthAdapter` by running a lightweight command (default **`PING`**) and returning latency in metadata.

Install the Valkey client you use as a peer dependency; only that adapter’s subpath needs to be imported.

## Install

```bash
npm install healthzkit @healthzkit/valkey
```

Pick one client (peer dependency):

```bash
npm install iovalkey              # for @healthzkit/valkey/iovalkey
npm install @valkey/valkey-glide    # for @healthzkit/valkey/valkey-glide
```

The package is ESM-only (`"type": "module"`).

## Quick start

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
      }),
    },
  ],
});
```

Use a subpath import so unused clients are not pulled in:

| Client                                                              | Import                            | Adapter              |
| ------------------------------------------------------------------- | --------------------------------- | -------------------- |
| [iovalkey](https://github.com/valkey-io/iovalkey)                   | `@healthzkit/valkey/iovalkey`     | `iovalkeyAdapter`    |
| [Valkey GLIDE](https://github.com/valkey-io/valkey-glide) (Node.js) | `@healthzkit/valkey/valkey-glide` | `glideValkeyAdapter` |

All adapters are also re-exported from `@healthzkit/valkey` if you depend on multiple clients.

## Adapters

### iovalkey

```ts
import { iovalkeyAdapter } from "@healthzkit/valkey/iovalkey";
import { Redis } from "iovalkey";

// Connection string (creates and reuses an internal client)
iovalkeyAdapter({ connectionString: "redis://localhost:6379" });

// Existing client
iovalkeyAdapter({ client: new Redis(process.env.VALKEY_URL!) });
```

The command string is passed to iovalkey **`client.call(...)`** as a single string (for example `"PING"` or `"ECHO x"`).

### Valkey GLIDE

```ts
import { glideValkeyAdapter } from "@healthzkit/valkey/valkey-glide";
import { GlideClient } from "@valkey/valkey-glide";

// Connection string (parsed into GlideClientConfiguration, then createClient)
glideValkeyAdapter({ connectionString: "valkey://localhost:6379" });

// Existing client
const client = await GlideClient.createClient({
  addresses: [{ host: "localhost", port: 6379 }],
});
glideValkeyAdapter({ client });
```

Supported connection-string schemes: `redis://`, `rediss://`, `valkey://`, and `valkeys://`. TLS is enabled for `rediss://` and `valkeys://`. Username, password, and database index (`/0`–`/15`) are read from the URL when present.

The `command` string is split on whitespace and passed to **`customCommand` as an argv array** (default `["PING"]`; custom example `"ECHO hello"` → `["ECHO", "hello"]`).

## Options

Shared options on every adapter:

- **`command`** — Command to run. Default `"PING"`.
- **`metadata`** — Optional sync or async function (`MetadataFn<T>`) with signature `(client) => Record<string, unknown> | Promise<Record<string, unknown>>`. Its returned object is merged into the check result with `latencyMs` (same `metadata` / `MetadataFn<T>` pattern as other adapters, e.g. mongo).

Connection options (mutually exclusive per adapter):

| Adapter      | Create from credentials        | Use existing client |
| ------------ | ------------------------------ | ------------------- |
| iovalkey     | `connectionString`, `options?` | `client`            |
| Valkey GLIDE | `connectionString`, `options?` | `client`            |

For iovalkey, `options` is passed to the `Redis` constructor (merged with `maxRetriesPerRequest: 1` and `enableReadyCheck: false`). For Valkey GLIDE, `options` is merged over the parsed connection string before `GlideClient.createClient`.

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
