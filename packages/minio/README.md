# @healthzkit/minio

MinIO health adapters for [healthzkit](https://healthzkit.dev). The adapter calls **`listBuckets()`** on the official **[`minio`](https://github.com/minio/minio-js)** client and returns **`ok`** with round-trip latency on success.

Install **`minio`** as a peer dependency (v7.1+ or v8).

## Install

```bash
npm install healthzkit @healthzkit/minio minio
```

The package is ESM-only (`"type": "module"`).

## Quick start

```ts
import { createHealthKit } from "healthzkit";
import { minioAdapter } from "@healthzkit/minio";

const kit = createHealthKit({
  checks: [
    {
      name: "minio",
      type: ["readiness"],
      adapter: minioAdapter({
        config: {
          endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
          port: Number(process.env.MINIO_PORT ?? 9000),
          useSSL: process.env.MINIO_USE_SSL === "true",
          accessKey: process.env.MINIO_ACCESS_KEY!,
          secretKey: process.env.MINIO_SECRET_KEY!,
        },
      }),
    },
  ],
});
```

Use a subpath import when you want a dedicated entry for bundlers:

| Import                    | Exports        |
| ------------------------- | -------------- |
| `@healthzkit/minio`       | `minioAdapter` |
| `@healthzkit/minio/minio` | `minioAdapter` |

Both resolve to the same factory.

## `minioAdapter`

**Peer:** `minio` >= 7.1.0 or >= 8.0.0.

Each check runs **`client.listBuckets()`** and records round-trip latency in **`metadata.latencyMs`**.

### Config

Pass **`config`** as [`ClientOptions`](https://github.com/minio/minio-js/blob/master/docs/API.md#new-clientendpoint-port-usessl-accesskey-secretkey-region-transport-sessiontoken-partsize) for the official client. The adapter lazily imports **`minio`**, creates a shared **`Client`**, and reuses it across checks.

```ts
import { minioAdapter } from "@healthzkit/minio";

const adapter = minioAdapter({
  config: {
    endPoint: "localhost",
    port: 9000,
    useSSL: false,
    accessKey: "minioadmin",
    secretKey: "minioadmin",
  },
});
```

### Existing client

Pass **`client`** as an existing **`Client`** instance. The adapter reuses that client across checks (no internal lifecycle management).

```ts
import { Client } from "minio";
import { minioAdapter } from "@healthzkit/minio/minio";

const client = new Client({
  endPoint: process.env.MINIO_ENDPOINT!,
  port: 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
});

const adapter = minioAdapter({
  client,
  metadata: () => ({ endpoint: process.env.MINIO_ENDPOINT }),
});
```

Provide **`config`** or **`client`**, not both.

## Options

| Option         | Description                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| **`config`**   | `ClientOptions` for a lazily created client.                                                          |
| **`client`**   | Existing `minio` `Client`.                                                                            |
| **`metadata`** | Optional `(client) => Record<string, unknown>` (sync or async) merged into metadata with `latencyMs`. |

## Check result

On success:

```json
{
  "status": "ok",
  "metadata": { "latencyMs": 24 }
}
```

On failure, `status` is **`fail`** and `error` is set (see [healthzkit](https://healthzkit.dev) for how that rolls up into probe responses).

## Scheduling

For object storage that should not be queried on every probe, pair this adapter with a **`schedule`** on the check so readiness reads cached results. See the **Scheduling** section in the `healthzkit` README.

## Development (this repo)

From the package directory:

```bash
vp install
vp test
vp pack
```

See the repo root `AGENTS.md` for Vite+ / `vp` conventions.
