---
title: Kafka adapter
description: Use @healthzkit/kafka adapters for kafkajs and node-rdkafka—cluster metadata probes, latency metadata, optional hooks, install steps, and Healthzkit readiness check examples.
---

# Kafka adapters (`@healthzkit/kafka`)

The **`@healthzkit/kafka`** package ships ready-made [`HealthAdapter`](/guide/checks-and-adapters) implementations for common Kafka Node.js clients. Each adapter measures round-trip latency, returns **`ok`** with `metadata.latencyMs` (and any extra fields from an optional hook), or **`fail`** with the caught error.

Install the adapter package and **at least one** peer client library:

```bash
pnpm add @healthzkit/kafka healthzkit
# plus one of:
pnpm add kafkajs
pnpm add node-rdkafka
```

Both clients are optional peers: install only the stack you use.

`node-rdkafka` is a native addon (requires `librdkafka` at build/runtime). Prefer **`kafkajs`** when you want a pure JavaScript client.

## Shared options

Every factory accepts a small common shape (see `BaseKafkaOptions` in the package):

| Option         | Description                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| **`metadata`** | Optional `(client) => Record<string, unknown>` (sync or async) merged into the check metadata alongside `latencyMs`. |

Pass either client configuration or an existing client/producer/consumer—not both. The shape depends on the adapter (see below).

## `kafkajsAdapter`

**Peer:** `kafkajs` >= 2.

Each check creates an admin client, connects, calls **`describeCluster()`**, and disconnects the admin handle. The underlying **`Kafka`** instance is reused when you pass **`config`**.

### Config

The adapter lazily imports `kafkajs`, constructs **`new Kafka(config)`** once, and reuses it across checks.

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

Pass **`client`** as an existing **`Kafka`** instance from your app. The adapter reuses that client across checks.

```ts
import { Kafka } from "kafkajs";
import { kafkajsAdapter } from "@healthzkit/kafka";

const kafka = new Kafka({ brokers: [process.env.KAFKA_BROKERS!] });

const adapter = kafkajsAdapter({
  client: kafka,
  metadata: () => ({ driver: "kafkajs" }),
});
```

## `nodeRdKafkaAdapter`

**Peer:** `node-rdkafka` >= 3.

Each check fetches broker metadata via **`getMetadata()`** when the client is already connected, or **`connect({}, cb)`** otherwise. That exercises the broker path without producing or consuming messages.

### Config

The adapter lazily imports `node-rdkafka`, constructs **`new Producer(config)`** once, and reuses it across checks.

```ts
import { nodeRdKafkaAdapter } from "@healthzkit/kafka";

const adapter = nodeRdKafkaAdapter({
  config: { "bootstrap.servers": process.env.KAFKA_BROKERS! },
});
```

`config` is a **`ProducerGlobalConfig`** object (for example `bootstrap.servers`, `security.protocol`, `sasl.username`).

### Existing client

Pass **`client`** as an existing **`Producer`** or **`KafkaConsumer`** from your app. The adapter reuses that instance across checks.

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

## Wiring into `createHealthKit`

Treat each factory's return value as **`adapter`** on a check (same as a hand-written `{ check() { ... } }` object):

```ts
adapter: kafkajsAdapter({ config: { brokers: [process.env.KAFKA_BROKERS!] } }),
```

Combine with **`schedule`** on the check if you want cached readiness results instead of hitting the broker on every probe (see [Scheduling](/guide/scheduling)).
