---
title: Elasticsearch adapter
description: Use @healthzkit/elasticsearch with the official Elasticsearch JavaScript client—cluster health probes, degraded yellow status, latency metadata, and Healthzkit readiness examples.
---

# Elasticsearch adapter (`@healthzkit/elasticsearch`)

The **`@healthzkit/elasticsearch`** package provides a [`HealthAdapter`](/guide/checks-and-adapters) for the official **[`@elastic/elasticsearch`](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/index.html)** client. Each check calls **`cluster.health()`** and maps Elasticsearch cluster status to probe status:

| Cluster status | Check status   |
| -------------- | -------------- |
| **`green`**    | **`ok`**       |
| **`yellow`**   | **`degraded`** |
| **`red`**      | **`fail`**     |

Transport or API errors return **`fail`** with the caught error.

Install the adapter package and the peer client:

```bash
pnpm add @healthzkit/elasticsearch @elastic/elasticsearch
```

**Peer:** `@elastic/elasticsearch` >= 9.

## Package entrypoints

- **`@healthzkit/elasticsearch`** — `elasticsearchAdapter` and option types.
- **`@healthzkit/elasticsearch/elasticsearch`** — `elasticsearchAdapter` only.

Both resolve to the same factory. Use the subpath when you want a dedicated entry for bundlers.

## Shared options

`BaseElasticsearchOptions`:

| Option         | Description                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| **`metadata`** | Optional `(client) => Record<string, unknown>` (sync or async) merged into metadata with `latencyMs`. |

Pass either **`config`** or an existing **`client`** (not both).

## `elasticsearchAdapter`

Each check runs **`client.cluster.health()`** and records round-trip latency in **`metadata.latencyMs`**, plus **`clusterStatus`**, **`clusterName`**, and **`numberOfNodes`** from the health response.

### Config

Pass **`config`** as [`ClientOptions`](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/client-connecting.html). The adapter lazily imports **`@elastic/elasticsearch`**, creates a shared **`Client`**, and reuses it across checks. When **`config`** is omitted, the default node is **`http://localhost:9200`**.

```ts
import { createHealthKit } from "healthzkit";
import { elasticsearchAdapter } from "@healthzkit/elasticsearch";

const kit = createHealthKit({
  checks: [
    {
      name: "elasticsearch",
      type: ["readiness"],
      adapter: elasticsearchAdapter({
        config: {
          node: process.env.ELASTICSEARCH_URL ?? "http://localhost:9200",
        },
      }),
    },
  ],
});
```

### Existing client

Pass **`client`** as an existing **`Client`**. The adapter reuses that instance across checks.

```ts
import { Client } from "@elastic/elasticsearch";
import { elasticsearchAdapter } from "@healthzkit/elasticsearch/elasticsearch";

const client = new Client({ node: process.env.ELASTICSEARCH_URL! });

const adapter = elasticsearchAdapter({
  client,
  metadata: async (c) => {
    const info = await c.info();
    return { version: info.version.number };
  },
});
```

## Check metadata

Successful checks include cluster fields alongside any custom **`metadata`** hook output:

```json
{
  "status": "ok",
  "metadata": {
    "latencyMs": 18,
    "clusterStatus": "green",
    "clusterName": "docker-cluster",
    "numberOfNodes": 3
  }
}
```

A **`yellow`** cluster yields **`degraded`**; a **`red`** cluster yields **`fail`** while still returning cluster metadata when the API call succeeds.

## Wiring into `createHealthKit`

Treat the factory return value as **`adapter`** on a check (same as a hand-written `{ check() { ... } }` object):

```ts
adapter: elasticsearchAdapter({ client: myEsClient }),
```

Combine with **`schedule`** on the check if you want cached readiness results instead of calling Elasticsearch on every probe (see [Scheduling](/guide/scheduling)).
