---
title: DynamoDB adapter
description: Health checks for AWS SDK v2 and v3 DynamoDB clients with @healthzkit/dynamo.
---

# DynamoDB adapters (`@healthzkit/dynamo`)

The **`@healthzkit/dynamo`** package provides [`HealthAdapter`](/guide/checks-and-adapters) helpers for AWS SDK v2 **[`aws-sdk`](https://github.com/aws/aws-sdk-js)** and v3 **[`@aws-sdk/client-dynamodb`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/)**. Successful checks call **`ListTables`** with **`Limit: 1`** and return **`ok`** with `metadata.latencyMs` plus any fields from an optional **`metadata`** hook; failures return **`fail`** with the caught error.

Install the adapter package and **one** AWS SDK:

```bash
pnpm add @healthzkit/dynamo healthzkit
# plus one of:
pnpm add aws-sdk
pnpm add @aws-sdk/client-dynamodb
```

Both SDKs are optional peers-install only the one you use.

## Package entrypoints

- **`@healthzkit/dynamo`** - `dynamoV2Adapter`, `dynamoV3Adapter`, and their option types.
- **`@healthzkit/dynamo/v2`** - `dynamoV2Adapter` only.
- **`@healthzkit/dynamo/v3`** - `dynamoV3Adapter` only.

Use subpath imports when you want to avoid pulling the unused SDK into your bundle analysis path.

## Shared options

Both factories accept `BaseDynamoOptions`:

| Option         | Description                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| **`metadata`** | Optional `(client) => Record<string, unknown>` (sync or async) merged into metadata with `latencyMs`. |

Pass either **`config`** or an existing **`client`** (not both). The shape depends on the adapter (see below).

## `dynamoV2Adapter` (`aws-sdk`)

**Peer:** `aws-sdk` >= 2.

Uses the v2 **`DynamoDB`** client and **`listTables({ Limit: 1 })`**. Suitable for legacy services still on AWS SDK for JavaScript v2.

### Config

The adapter lazily imports **`aws-sdk`**, constructs **`new AWS.DynamoDB(config)`** once, and reuses it across checks.

```ts
import { createHealthKit } from "healthzkit";
import { dynamoV2Adapter } from "@healthzkit/dynamo";

const kit = createHealthKit({
  checks: [
    {
      name: "dynamodb",
      type: ["readiness"],
      adapter: dynamoV2Adapter({
        config: { region: process.env.AWS_REGION ?? "us-east-1" },
      }),
    },
  ],
});
```

### Existing client

```ts
import AWS from "aws-sdk";
import { dynamoV2Adapter } from "@healthzkit/dynamo/v2";

const client = new AWS.DynamoDB({ region: "us-east-1" });

const adapter = dynamoV2Adapter({
  client,
  metadata: () => ({ sdk: "v2" }),
});
```

## `dynamoV3Adapter` (`@aws-sdk/client-dynamodb`)

**Peer:** `@aws-sdk/client-dynamodb` >= 3.

Uses **`DynamoDBClient`** and **`ListTablesCommand`** with **`Limit: 1`**. Prefer this for new code on AWS SDK for JavaScript v3.

### Config

The adapter lazily imports **`@aws-sdk/client-dynamodb`**, constructs **`new DynamoDBClient(config)`** once, and reuses it across checks.

```ts
import { dynamoV3Adapter } from "@healthzkit/dynamo/v3";

const adapter = dynamoV3Adapter({
  config: { region: process.env.AWS_REGION ?? "us-east-1" },
});
```

### Existing client

```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { dynamoV3Adapter } from "@healthzkit/dynamo";

const client = new DynamoDBClient({ region: "us-east-1" });

const adapter = dynamoV3Adapter({
  client,
  metadata: async () => ({ sdk: "v3" }),
});
```

## Scheduling

For DynamoDB tables that should not be queried on every probe, pair these adapters with a **`schedule`** on the check so readiness reads cached results (see [Scheduling](/guide/scheduling)).
