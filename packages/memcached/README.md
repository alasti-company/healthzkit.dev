# @healthzkit/memcached

Memcached health adapters for [healthzkit](https://github.com/alasti-company/healthzkit.dev). Checks return `ok` with `metadata.latencyMs`, or `fail` with an `Error`.

## Install

```bash
npm install healthzkit @healthzkit/memcached
# Install the client you use:
npm install memcached
# or:
npm install memjs
```

The package is ESM-only and requires Node.js 22.12+. The clients are optional peers. TypeScript projects should also install `@types/memcached` or `@types/memjs` for their chosen client.

## Quick start

```ts
import { createHealthKit } from "healthzkit";
import { memcachedAdapter } from "@healthzkit/memcached/memcached";

const kit = createHealthKit({
  checks: [
    {
      name: "memcached",
      type: ["readiness"],
      adapter: memcachedAdapter({ servers: "localhost:11211" }),
    },
  ],
});
```

Use a subpath import to load only the client you install. Both factories are also exported from `@healthzkit/memcached`; client libraries load lazily when you use the `servers` option.

| Client                                             | Import                            | Factory            | Check                                                               |
| -------------------------------------------------- | --------------------------------- | ------------------ | ------------------------------------------------------------------- |
| [memcached](https://github.com/3rd-Eden/memcached) | `@healthzkit/memcached/memcached` | `memcachedAdapter` | Read-only `VERSION` across the client's server list                 |
| [memjs](https://github.com/memcachier/memjs)       | `@healthzkit/memcached/memjs`     | `memjsAdapter`     | Read-only `GET` of a probe key on the server selected by the client |

## memcached

```ts
import Memcached from "memcached";
import { memcachedAdapter } from "@healthzkit/memcached/memcached";

// Create and reuse an internal client.
memcachedAdapter({
  servers: ["localhost:11211", "localhost:11212"],
  options: { timeout: 1000, retries: 1 },
});

// Reuse your application's client.
const client = new Memcached("localhost:11211");
memcachedAdapter({ client });
```

`servers` accepts a `host:port` string, an array of locations, or an object mapping locations to weights. The adapter requires non-empty locations. `options` forwards the client's constructor options, with `retries: 1` by default. Its `timeout` is in milliseconds.

The adapter fails on any reported server error or an empty version response. This client uses the ASCII protocol and does not support SASL authentication.

## memjs

```ts
import { Client } from "memjs";
import { memjsAdapter } from "@healthzkit/memcached/memjs";

memjsAdapter({
  servers: "localhost:11211,localhost:11212",
  options: { timeout: 0.5, username: "user", password: "password" },
  key: "healthzkit:healthcheck",
});

const client = Client.create("localhost:11211");
memjsAdapter({ client });
```

`servers` is a non-empty comma-separated string in memjs format: `[user:pass@]host[:port]`. `options` forwards client and server options, with `retries: 1` by default. Its `timeout` and `conntimeout` are in seconds.

`key` defaults to `healthzkit:healthcheck`. It must be 1–250 UTF-8 bytes without whitespace or NUL. A missing key is healthy: the server responded successfully. The adapter never writes, deletes, or requires a pre-existing key. It checks the server chosen for that key, so it does not verify every cluster member. Client failover settings also affect which server responds.

## Metadata and client ownership

Both adapters accept a synchronous or asynchronous metadata hook:

```ts
memcachedAdapter({
  servers: "localhost:11211",
  metadata: () => ({ region: "us-west" }),
});
```

The hook receives the resolved client after the check succeeds. Its fields merge into the result; measured `latencyMs` takes precedence. Hook errors fail the check.

Use either `client` or `servers` with optional `options`. Internally created clients are lazy and reused, including across concurrent checks. Adapters keep clients open between checks and do not close supplied clients. If you need explicit shutdown control, supply your own client and call `client.end()` for memcached or `client.close()` for memjs when your application stops.

Use [Scheduling](https://healthzkit.dev/guide/scheduling) to cache readiness results when you want to avoid checking the cache on every HTTP request.

## Development

```bash
vp test
vp check
vp run build
```
