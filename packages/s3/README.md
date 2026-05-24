# @healthzkit/s3

Amazon S3 **healthzkit** `HealthAdapter` helpers for AWS SDK v2 **[`aws-sdk`](https://github.com/aws/aws-sdk-js)** and v3 **[`@aws-sdk/client-s3`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/)**. Successful checks call `ListBuckets` and return `ok` with `metadata.latencyMs`, `metadata.bucketCount`, plus any fields from an optional `metadata` hook; failures return `fail` with the caught error.

## Install

```bash
npm install @healthzkit/s3 healthzkit
# plus one of:
npm install aws-sdk
npm install @aws-sdk/client-s3
```

Both SDKs are optional peers—install only the one you use.

## Package entrypoints

| Import              | Exports                                        |
| ------------------- | ---------------------------------------------- |
| `@healthzkit/s3`    | `s3V2Adapter`, `s3V3Adapter`, and option types |
| `@healthzkit/s3/v2` | `s3V2Adapter` only                             |
| `@healthzkit/s3/v3` | `s3V3Adapter` only                             |

Use subpath imports when you want to avoid pulling the unused SDK into your bundle analysis path.

## Shared options

Both factories accept `BaseS3Options`:

| Option     | Description                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| `metadata` | Optional `(client) => Record<string, unknown>` (sync or async) merged into metadata with `latencyMs`. |

Pass either `config` or an existing `client` (not both). The shape depends on the adapter (see below).

## `s3V2Adapter` (`aws-sdk`)

**Peer:** `aws-sdk` ≥ 2.

Uses the v2 `S3` client and `listBuckets()`. Suitable for legacy services still on AWS SDK for JavaScript v2.

### Config

The adapter lazily imports `aws-sdk`, constructs `new AWS.S3(config)` once, and reuses it across checks.

```ts
import { createHealthKit } from "healthzkit";
import { s3V2Adapter } from "@healthzkit/s3";

const kit = createHealthKit({
  checks: [
    {
      name: "s3",
      type: ["readiness"],
      adapter: s3V2Adapter({
        config: { region: process.env.AWS_REGION ?? "us-east-1" },
      }),
    },
  ],
});
```

### Existing client

```ts
import AWS from "aws-sdk";
import { s3V2Adapter } from "@healthzkit/s3/v2";

const client = new AWS.S3({ region: "us-east-1" });

const adapter = s3V2Adapter({
  client,
  metadata: () => ({ sdk: "v2" }),
});
```

## `s3V3Adapter` (`@aws-sdk/client-s3`)

**Peer:** `@aws-sdk/client-s3` ≥ 3.

Uses `S3Client` and `ListBucketsCommand`. Prefer this for new code on AWS SDK for JavaScript v3.

### Config

The adapter lazily imports `@aws-sdk/client-s3`, constructs `new S3Client(config)` once, and reuses it across checks.

```ts
import { s3V3Adapter } from "@healthzkit/s3/v3";

const adapter = s3V3Adapter({
  config: { region: process.env.AWS_REGION ?? "us-east-1" },
});
```

### Existing client

```ts
import { S3Client } from "@aws-sdk/client-s3";
import { s3V3Adapter } from "@healthzkit/s3";

const client = new S3Client({ region: "us-east-1" });

const adapter = s3V3Adapter({
  client,
  metadata: async () => ({ sdk: "v3" }),
});
```

## Check result

On success:

```json
{
  "status": "ok",
  "metadata": { "latencyMs": 42, "bucketCount": 3 }
}
```

On failure, `status` is `"fail"` and `error` is set (see [healthzkit](https://github.com/alasti-company/healthzkit) for how that rolls up into probe responses).

## Scheduling

For S3 buckets that should not be queried on every probe, pair these adapters with a **`schedule`** on the check so readiness reads cached results. See the **Scheduling** section in the `healthzkit` README.

## Development

From the monorepo root:

```bash
vp install
vp test --filter @healthzkit/s3
vp pack --filter @healthzkit/s3
```

See the repo root `AGENTS.md` for Vite+ / `vp` conventions.
