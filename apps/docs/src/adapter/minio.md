---
title: MinIO adapter
description: Use @healthzkit/minio with the official MinIO JavaScript client—listBuckets probes, latency metadata, client options, and Healthzkit readiness examples for MinIO and S3-compatible storage.
---

# MinIO adapter (`@healthzkit/minio`)

The **`@healthzkit/minio`** package provides a [`HealthAdapter`](/guide/checks-and-adapters) for the official **[`minio`](https://github.com/minio/minio-js)** JavaScript client. Each check calls **`listBuckets()`** and returns **`ok`** with **`metadata.latencyMs`** on success; transport or API errors return **`fail`** with the caught error.

Install the adapter package and the peer client:

```bash
pnpm add @healthzkit/minio minio
```

**Peer:** `minio` >= 7.1.0 or >= 8.0.0.

## Package entrypoints

- **`@healthzkit/minio`** — `minioAdapter` and option types.
- **`@healthzkit/minio/minio`** — `minioAdapter` only.

Both resolve to the same factory. Use the subpath when you want a dedicated entry for bundlers.

## Shared options

`BaseMinioOptions`:

| Option         | Description                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| **`metadata`** | Optional `(client) => Record<string, unknown>` (sync or async) merged into metadata with `latencyMs`. |

Pass either **`config`** or an existing **`client`** (not both).

## `minioAdapter`

Each check runs **`client.listBuckets()`** and records round-trip latency in **`metadata.latencyMs`**.

### Config

Pass **`config`** as [`ClientOptions`](https://github.com/minio/minio-js/blob/master/docs/API.md#new-clientendpoint-port-usessl-accesskey-secretkey-region-transport-sessiontoken-partsize). The adapter lazily imports **`minio`**, creates a shared **`Client`**, and reuses it across checks.

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

### Existing client

Pass **`client`** as an existing **`Client`**. The adapter reuses that instance across checks.

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

## Check metadata

Successful checks include latency and any custom **`metadata`** hook output:

```json
{
  "status": "ok",
  "metadata": {
    "latencyMs": 24,
    "endpoint": "localhost"
  }
}
```

## Wiring into `createHealthKit`

Treat the factory return value as **`adapter`** on a check (same as a hand-written `{ check() { ... } }` object):

```ts
adapter: minioAdapter({ client: myMinioClient }),
```

Combine with **`schedule`** on the check if you want cached readiness results instead of calling MinIO on every probe (see [Scheduling](/guide/scheduling)).
