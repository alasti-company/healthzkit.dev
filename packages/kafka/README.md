# @healthzkit/kafka

Kafka **healthzkit** `HealthAdapter` helpers for **[`kafkajs`](https://kafka.js.org/)** and **[`node-rdkafka`](https://github.com/Blizzard/node-rdkafka)**. Successful checks return `ok` with `metadata.latencyMs` plus any fields from an optional `metadata` hook; failures return `fail` with the caught error.

## Install

```bash
npm install @healthzkit/kafka healthzkit
# plus one of:
npm install kafkajs
npm install node-rdkafka
```

Both clients are optional peers—install the library you use.

`node-rdkafka` is a native addon (requires `librdkafka` at build/runtime). Prefer **`kafkajs`** when you want a pure JavaScript client.

## Shared options

Both factories accept `BaseKafkaOptions`:

| Option     | Description                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| `metadata` | Optional `(client) => Record<string, unknown>` (sync or async) merged into metadata with `latencyMs`. |

Pass either client configuration or an existing client/producer/consumer (not both). The shape depends on the adapter (see below).

## `kafkajsAdapter` (`kafkajs`)

**Peer:** `kafkajs` ≥ 2.

Each check creates an admin client, connects, calls `describeCluster()`, and disconnects the admin handle. The underlying `Kafka` instance is reused when you pass `config`.

### Config

The adapter lazily imports `kafkajs`, constructs `new Kafka(config)` once, and reuses it across checks.

```ts
import { createHealthKit } from "healthzkit";
import { kafkajsAdapter } from "@healthzkit/kafka";

const kit = createHealthKit({
  checks: [
    {
      name: "kafka",
      type: ["readiness"],
      adapter: kafkajsAdapter({
        config: { brokers: [process.env.KAFKA_BROKERS!] },
      }),
    },
  ],
});
```

`config` is the first argument to the `Kafka` constructor (for example `brokers`, `clientId`, `ssl`, `sasl`).

### Existing client

Pass **`client`** as an existing `Kafka` instance from your app. The adapter reuses that client across checks.

```ts
import { Kafka } from "kafkajs";
import { kafkajsAdapter } from "@healthzkit/kafka";

const kafka = new Kafka({ brokers: [process.env.KAFKA_BROKERS!] });

const adapter = kafkajsAdapter({
  client: kafka,
  metadata: () => ({ driver: "kafkajs" }),
});
```

## `nodeRdKafkaAdapter` (`node-rdkafka`)

**Peer:** `node-rdkafka` ≥ 3.

Each check fetches broker metadata via `getMetadata()` when the client is already connected, or `connect({}, cb)` otherwise. That exercises the broker path without producing or consuming messages.

### Config

The adapter lazily imports `node-rdkafka`, constructs `new Producer(config)` once, and reuses it across checks.

```ts
import { nodeRdKafkaAdapter } from "@healthzkit/kafka";

const adapter = nodeRdKafkaAdapter({
  config: { "bootstrap.servers": process.env.KAFKA_BROKERS! },
});
```

`config` is a `ProducerGlobalConfig` object (for example `bootstrap.servers`, `security.protocol`, `sasl.username`).

### Existing client

Pass **`client`** as an existing `Producer` or `KafkaConsumer` from your app. The adapter reuses that instance across checks.

```ts
import { Producer } from "node-rdkafka";
import { nodeRdKafkaAdapter } from "@healthzkit/kafka";

const producer = new Producer({
  "bootstrap.servers": process.env.KAFKA_BROKERS!,
});

const adapter = nodeRdKafkaAdapter({
  client: producer,
  metadata: () => ({ driver: "node-rdkafka" }),
});
```

## Check result

On success:

```json
{
  "status": "ok",
  "metadata": { "latencyMs": 12 }
}
```

On failure, `status` is `"fail"` and `error` is set (see [healthzkit](https://github.com/alasti-company/healthzkit) for how that rolls up into probe responses).

## Scheduling

For brokers that should not be probed on every request, pair these adapters with a **`schedule`** on the check so readiness reads cached results instead of hitting Kafka on every probe. See the **Scheduling** section in the `healthzkit` README.

## Development

From the monorepo root:

```bash
vp install
vp test --filter @healthzkit/kafka
vp pack --filter @healthzkit/kafka
```

See the repo root `AGENTS.md` for Vite+ / `vp` conventions.
