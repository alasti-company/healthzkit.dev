import type {
  ServiceBusAdministrationClient,
  ServiceBusAdministrationClientOptions,
} from "@azure/service-bus";
import { buildErrorResult, buildResult, type HealthAdapter } from "@healthzkit/shared";

interface BaseOptions {
  queueName: string;
  /** Cooperative HTTP operation deadline, including retries. Default: 2,000 ms. */
  operationTimeoutMs?: number;
  /** Degrade only when the active message count exceeds this inclusive limit. */
  maxActiveMessageCount?: number;
  /** Degrade only when the dead-letter count exceeds this inclusive limit. */
  maxDeadLetterMessageCount?: number;
}

export type AzureServiceBusAdapterOptions = BaseOptions &
  (
    | {
        client: ServiceBusAdministrationClient;
        connectionString?: never;
        clientOptions?: never;
      }
    | {
        client?: never;
        connectionString: string;
        clientOptions?: ServiceBusAdministrationClientOptions;
      }
  );

/** Read queue runtime properties through the management API; never send or receive messages. */
export function azureServiceBusAdapter(options: AzureServiceBusAdapterOptions): HealthAdapter {
  if (
    options.client !== undefined &&
    (options.connectionString !== undefined || options.clientOptions !== undefined)
  ) {
    throw new TypeError("client is exclusive with connectionString and clientOptions");
  }
  const operationTimeoutMs = options.operationTimeoutMs ?? 2_000;
  if (
    !Number.isInteger(operationTimeoutMs) ||
    operationTimeoutMs < 1 ||
    operationTimeoutMs > 2_147_483_647
  ) {
    throw new RangeError("operationTimeoutMs must be an integer between 1 and 2147483647");
  }
  if (!options.queueName.trim()) throw new TypeError("queueName must not be empty");
  for (const name of ["maxActiveMessageCount", "maxDeadLetterMessageCount"] as const) {
    const value = options[name];
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw new RangeError(`${name} must be a non-negative safe integer`);
    }
  }

  let clientPromise: Promise<ServiceBusAdministrationClient> | undefined;
  function getClient(): Promise<ServiceBusAdministrationClient> {
    if (options.client) return Promise.resolve(options.client);
    clientPromise ??= import("@azure/service-bus")
      .then(
        ({ ServiceBusAdministrationClient }) =>
          new ServiceBusAdministrationClient(options.connectionString, {
            ...options.clientOptions,
            retryOptions: { maxRetries: 0, ...options.clientOptions?.retryOptions },
          }),
      )
      .catch((error: unknown) => {
        clientPromise = undefined;
        throw error;
      });
    return clientPromise;
  }

  return {
    async check(context) {
      const controller = new AbortController();
      const signal = context
        ? AbortSignal.any([context.signal, controller.signal])
        : controller.signal;
      const timer = setTimeout(
        () => controller.abort(new Error("Azure Service Bus operation timed out")),
        operationTimeoutMs,
      );
      try {
        signal.throwIfAborted();
        const client = await getClient();
        signal.throwIfAborted();
        const start = Date.now();
        const properties = await client.getQueueRuntimeProperties(options.queueName, {
          abortSignal: signal,
        });
        signal.throwIfAborted();
        const result = buildResult(Date.now() - start, {
          activeMessageCount: properties.activeMessageCount,
          deadLetterMessageCount: properties.deadLetterMessageCount,
          totalMessageCount: properties.totalMessageCount,
          scheduledMessageCount: properties.scheduledMessageCount,
        });
        if (
          (options.maxActiveMessageCount !== undefined &&
            properties.activeMessageCount > options.maxActiveMessageCount) ||
          (options.maxDeadLetterMessageCount !== undefined &&
            properties.deadLetterMessageCount > options.maxDeadLetterMessageCount)
        )
          result.status = "degraded";
        return result;
      } catch (error) {
        return buildErrorResult(error);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
