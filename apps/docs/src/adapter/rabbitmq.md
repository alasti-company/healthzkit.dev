---
title: RabbitMQ adapter
description: Health checks for amqplib and amqp-connection-manager with @healthzkit/rabbitmq.
---

# RabbitMQ adapters (`@healthzkit/rabbitmq`)

The **`@healthzkit/rabbitmq`** package ships ready-made [`HealthAdapter`](/guide/checks-and-adapters) implementations for common AMQP clients. Each adapter measures round-trip latency, returns **`ok`** with `metadata.latencyMs` (and any extra fields from an optional hook), or **`fail`** with the caught error.

Install the adapter package and **at least one** peer client library:

```bash
pnpm add @healthzkit/rabbitmq healthzkit
# plus one of:
pnpm add amqplib
pnpm add amqp-connection-manager
```

Both clients are optional peers: install only the stack you use.

## Package entrypoints

| Import                                         | Exports                                                     |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `@healthzkit/rabbitmq`                         | `amqplibAdapter`, `amqpConnectionManagerAdapter`, and types |
| `@healthzkit/rabbitmq/amqplib`                 | `amqplibAdapter` only                                       |
| `@healthzkit/rabbitmq/amqp-connection-manager` | `amqpConnectionManagerAdapter` only                         |

Use subpath imports when you want to avoid pulling both clients into your bundle analysis path.

## Shared options

Every factory accepts a small common shape (see `BaseRabbitOptions` in the package):

| Option         | Description                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| **`metadata`** | Optional `(client) => Record<string, unknown>` (sync or async) merged into the check metadata alongside `latencyMs`. |

Pass either a connection URL (or URLs) or an existing client/connection manager-not both. The shape depends on the adapter (see below).

## `amqplibAdapter`

**Peer:** `amqplib` >= 1 or >= 2.

Each check opens a channel on the connection and closes it immediately. That exercises the broker path without leaving channels open.

### URL

The adapter lazily imports `amqplib`, calls `connect(url, socketOptions)` once, and reuses the same `ChannelModel` across checks.

```ts
import { createHealthKit } from "healthzkit";
import { amqplibAdapter } from "@healthzkit/rabbitmq";

const kit = createHealthKit({
  checks: [
    {
      name: "rabbitmq",
      type: ["readiness"],
      adapter: amqplibAdapter({
        url: process.env.AMQP_URL!,
        socketOptions: { timeout: 2000 },
      }),
    },
  ],
});
```

`url` may be a connection string or an `Options.Connect` object accepted by `amqplib.connect`.

### Existing connection

Pass **`connection`** as an existing `ChannelModel` or `RecoveringChannelModel` from your app. The adapter reuses that connection across checks.

```ts
import amqplib from "amqplib";
import { amqplibAdapter } from "@healthzkit/rabbitmq/amqplib";

const connection = await amqplib.connect(process.env.AMQP_URL!);

const adapter = amqplibAdapter({
  connection,
  metadata: () => ({ driver: "amqplib" }),
});
```

## `amqpConnectionManagerAdapter`

**Peer:** `amqp-connection-manager` >= 4 or >= 5.

Each check verifies that the connection manager reports at least one active connection via `isConnected()`. Use this when your app already relies on automatic reconnects and you want readiness to reflect the manager's view of connectivity rather than opening a new channel.

### URLs

The adapter lazily imports `amqp-connection-manager`, calls `connect(urls, connectionOptions)` once, and reuses the same manager across checks.

```ts
import { amqpConnectionManagerAdapter } from "@healthzkit/rabbitmq/amqp-connection-manager";

const adapter = amqpConnectionManagerAdapter({
  urls: [process.env.AMQP_URL!],
  connectionOptions: {
    heartbeatIntervalInSeconds: 5,
    reconnectTimeInSeconds: 2,
  },
});
```

### Existing connection manager

Pass **`connection`** as your app's `AmqpConnectionManager` instance.

```ts
import { connect } from "amqp-connection-manager";
import { amqpConnectionManagerAdapter } from "@healthzkit/rabbitmq";

const connection = connect([process.env.AMQP_URL!]);

const adapter = amqpConnectionManagerAdapter({
  connection,
  metadata: () => ({ driver: "amqp-connection-manager" }),
});
```

If no connection is active, the check fails with `rabbitmq adapter: connection manager has no active connections.`

## Wiring into `createHealthKit`

Treat each factory's return value as **`adapter`** on a check (same as a hand-written `{ check() { ... } }` object):

```ts
adapter: amqplibAdapter({ url: process.env.AMQP_URL! }),
```

Combine with **`schedule`** on the check if you want cached readiness results instead of opening channels on every probe (see [Scheduling](/guide/scheduling)).
