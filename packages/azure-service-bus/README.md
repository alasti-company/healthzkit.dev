# @healthzkit/azure-service-bus

Read a configured queue's runtime properties using `@azure/service-bus`'s `ServiceBusAdministrationClient`. This checks authenticated management access and reports queue counts. It never sends, peeks, or consumes messages. Success does not prove producer/consumer connectivity, permissions, throughput, or end-to-end delivery.

```bash
pnpm add healthzkit @healthzkit/azure-service-bus @azure/service-bus
```

```ts
import { createHealthKit } from "healthzkit";
import { azureServiceBusAdapter } from "@healthzkit/azure-service-bus";

const kit = createHealthKit({
  output: { exposeError: false, exposeMetadata: false },
  checks: [
    {
      name: "queue-management",
      type: ["readiness"],
      timeout: 3_000,
      schedule: { intervalMs: 30_000 },
      adapter: azureServiceBusAdapter({
        connectionString: process.env.SERVICE_BUS_CONNECTION_STRING!,
        queueName: "orders",
        operationTimeoutMs: 2_000,
        // Optional inclusive backlog limits; choose values for your workload.
        maxActiveMessageCount: 1_000,
        maxDeadLetterMessageCount: 0,
      }),
    },
  ],
});
kit.start();
// During application shutdown:
// kit.beginDrain();
// const deadline = setTimeout(() => process.exit(1), 5_000);
// try { await kit.close(); } finally { clearTimeout(deadline); }
```

## Options and results

Both `@healthzkit/azure-service-bus` and `@healthzkit/azure-service-bus/azure-service-bus` export `azureServiceBusAdapter` and `AzureServiceBusAdapterOptions`.

| Option                      | Meaning                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `queueName`                 | Required, nonempty configured queue name.                                                                                                        |
| `client`                    | Supplied `ServiceBusAdministrationClient`; exclusive with connection options.                                                                    |
| `connectionString`          | Lazily construct and reuse an administration client. Exclusive with `client`.                                                                    |
| `clientOptions`             | SDK `ServiceBusAdministrationClientOptions` for owned construction. Default HTTP `retryOptions.maxRetries` is `0`; explicit options override it. |
| `operationTimeoutMs`        | Cooperative operation deadline, including retries; default `2_000`. Integer from 1 to 2,147,483,647.                                             |
| `maxActiveMessageCount`     | Optional non-negative safe integer; counts above this limit return `degraded`.                                                                   |
| `maxDeadLetterMessageCount` | Optional non-negative safe integer; counts above this limit return `degraded`.                                                                   |

Each check calls `getQueueRuntimeProperties(queueName, { abortSignal })`. Successful results contain `latencyMs`, `activeMessageCount`, `deadLetterMessageCount`, `totalMessageCount`, and `scheduledMessageCount` in metadata. Counts are service snapshots, not a delivery guarantee. No thresholds apply by default; equality stays `ok`. SDK, authorization, missing-queue, and cancellation errors return `fail` with the caught error. Filter errors and metadata in public responses as shown above. An overall `degraded` rollup returns HTTP 200 by default; a failed check can instead make the overall result fail. Configure the check's `onDegraded` if needed.

## Supplied clients and identity

```ts
import { ServiceBusAdministrationClient } from "@azure/service-bus";
import { azureServiceBusAdapter } from "@healthzkit/azure-service-bus/azure-service-bus";

const client = new ServiceBusAdministrationClient(process.env.SERVICE_BUS_CONNECTION_STRING!, {
  retryOptions: { maxRetries: 0 },
});
const adapter = azureServiceBusAdapter({ client, queueName: "orders" });
```

For Microsoft Entra ID, construct a client with your namespace and credential using the SDK's credential constructor, then supply it through `client`. Install your chosen credential package separately (for example `@azure/identity`). Supplied clients, credentials, HTTP clients, and agents remain application-owned. The administration client has no SDK `close()`/`dispose()` API. This adapter creates no AMQP links and exposes no disposal hook; the same applies to its owned administration client. Clean up any custom transport resources in your application.

The SDK is an optional peer (`^7.10.0`); install it to construct or supply a real client. It is imported lazily for owned construction.

## Permissions, deadlines, and scheduling

Use credentials authorized for queue management reads. SAS authentication requires **Manage** on the relevant scope, which also grants Send and Listen; a send-only or listen-only policy is insufficient. For Entra ID, **Azure Service Bus Data Owner** provides the required access (or use a custom role with the required management read data actions). An Azure resource management role alone is not a substitute for Service Bus data authorization. Consider whether this management permission is appropriate for your readiness identity.

The adapter combines the Healthzkit check signal and its own finite deadline and forwards the resulting signal as the SDK operation's `abortSignal`. Cancellation is cooperative: a custom HTTP client or credential may ignore or delay it. The adapter does not race and abandon the underlying request; the core can return its check timeout while underlying work settles. Bound your custom credential/transport operations too, and use an application-level shutdown deadline around `kit.close()` (which has no built-in deadline).

The administration client uses HTTP pipeline `retryOptions` (`maxRetries`, `retryDelayInMs`, `maxRetryDelayInMs`), not the AMQP client's `RetryOptions.timeoutInMs`. Supplied clients retain their retry configuration. The operation abort deadline covers the SDK request and retry waits when honored. Schedule checks to avoid a management request on every readiness probe: [Scheduling](https://healthzkit.dev/guide/scheduling).

References: [administration client API](https://learn.microsoft.com/en-us/javascript/api/@azure/service-bus/servicebusadministrationclient), [administration options](https://learn.microsoft.com/en-us/javascript/api/@azure/service-bus/servicebusadministrationclientoptions), [SAS rights](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-sas#rights-required-for-service-bus-operations), [Entra authorization](https://learn.microsoft.com/en-us/azure/service-bus-messaging/authenticate-application).
