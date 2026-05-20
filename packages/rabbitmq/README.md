# @healthzkit/rabbitmq

RabbitMQ **healthzkit** `HealthAdapter` helpers for **[`amqplib`](https://github.com/amqp-node/amqplib)** and **[`amqp-connection-manager`](https://github.com/jwalton/node-amqp-connection-manager)**. Successful checks return `ok` with `metadata.latencyMs` plus any fields from an optional `metadata` hook; failures return `fail` with the caught error.

## Install

```bash
npm install @healthzkit/rabbitmq healthzkit
# plus one of:
npm install amqplib
npm install amqp-connection-manager
```

Both clients are optional peers—install the library you use.

## Package entrypoints

| Import                                         | Exports                                                     |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `@healthzkit/rabbitmq`                         | `amqplibAdapter`, `amqpConnectionManagerAdapter`, and types |
| `@healthzkit/rabbitmq/amqplib`                 | `amqplibAdapter` only                                       |
| `@healthzkit/rabbitmq/amqp-connection-manager` | `amqpConnectionManagerAdapter` only                         |

Use subpath imports when you want to avoid pulling both clients into your bundle analysis path.

## Shared options

Both factories accept `BaseRabbitOptions`:

| Option     | Description                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| `metadata` | Optional `(client) => Record<string, unknown>` (sync or async) merged into metadata with `latencyMs`. |

Pass either a connection URL (or URLs) or an existing client/connection manager (not both). The shape depends on the adapter (see below).

## `amqplibAdapter` (`amqplib`)

**Peer:** `amqplib` ≥ 1 or ≥ 2.

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

## `amqpConnectionManagerAdapter` (`amqp-connection-manager`)

**Peer:** `amqp-connection-manager` ≥ 4 or ≥ 5.

Each check verifies that the connection manager reports at least one active connection via `isConnected()`. Use this when your app already relies on automatic reconnects and you want readiness to reflect the manager’s view of connectivity rather than opening a new channel.

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

Pass **`connection`** as your app’s `AmqpConnectionManager` instance.

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

For brokers that should not be probed on every request, pair these adapters with a **`schedule`** on the check so readiness reads cached results instead of opening channels on every probe. See the **Scheduling** section in the `healthzkit` README.

## Development

From the monorepo root:

```bash
vp install
vp test --filter @healthzkit/rabbitmq
vp pack --filter @healthzkit/rabbitmq
```

See the repo root `AGENTS.md` for Vite+ / `vp` conventions.
