# @healthzkit/elasticsearch

Elasticsearch health adapters for [healthzkit](https://github.com/alasti-company/healthzkit). The adapter calls **`cluster.health()`** and maps cluster status to probe status: **`green`** → `ok`, **`yellow`** → `degraded`, **`red`** → `fail`.

Install **`@elastic/elasticsearch`** as a peer dependency (v8 or v9).

## Install

```bash
npm install healthzkit @healthzkit/elasticsearch @elastic/elasticsearch
```

The package is ESM-only (`"type": "module"`).

## Quick start

```ts
import { createHealthKit } from "healthzkit";
import { elasticsearchAdapter } from "@healthzkit/elasticsearch";

const kit = createHealthKit({
  checks: [
    {
      name: "elasticsearch",
      type: ["readiness"],
      adapter: elasticsearchAdapter({
        config: { node: process.env.ELASTICSEARCH_URL! },
      }),
    },
  ],
});
```

Use a subpath import when you want a dedicated entry for bundlers:

| Import                                    | Exports                |
| ----------------------------------------- | ---------------------- |
| `@healthzkit/elasticsearch`               | `elasticsearchAdapter` |
| `@healthzkit/elasticsearch/elasticsearch` | `elasticsearchAdapter` |

Both resolve to the same factory.

## `elasticsearchAdapter`

**Peer:** `@elastic/elasticsearch` >= 8 or >= 9.

Each check runs **`client.cluster.health()`** and records round-trip latency.

### Config

Pass **`config`** as [`ClientOptions`](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/client-connecting.html) for the official client. The adapter lazily imports **`@elastic/elasticsearch`**, creates a shared **`Client`**, and reuses it across checks. When **`config`** is omitted, the default node is **`http://localhost:9200`**.

```ts
import { elasticsearchAdapter } from "@healthzkit/elasticsearch";

const adapter = elasticsearchAdapter({
  config: {
    node: process.env.ELASTICSEARCH_URL ?? "http://localhost:9200",
  },
});
```

### Existing client

Pass **`client`** as an existing **`Client`** instance. The adapter reuses that client across checks (no internal lifecycle management).

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

Provide **`config`** or **`client`**, not both.

## Options

| Option         | Description                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| **`config`**   | `ClientOptions` for a lazily created client. Default node: `http://localhost:9200`.                   |
| **`client`**   | Existing `@elastic/elasticsearch` `Client`.                                                           |
| **`metadata`** | Optional `(client) => Record<string, unknown>` (sync or async) merged into metadata with `latencyMs`. |

## Check result

On success (cluster status **`green`**):

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

When the cluster reports **`yellow`**, the check status is **`degraded`** (metadata still includes `clusterStatus`, `clusterName`, and `numberOfNodes`). When the cluster is **`red`**, the check status is **`fail`**.

On transport or API errors, `status` is **`fail`** and `error` is set (see [healthzkit](https://github.com/alasti-company/healthzkit) for how that rolls up into probe responses).

## Development (this repo)

From the package directory:

```bash
vp install
vp test
vp pack
```

See the repo root `AGENTS.md` for Vite+ / `vp` conventions.
