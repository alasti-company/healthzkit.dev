import type { AmqpConnectionManager, AmqpConnectionManagerOptions } from "amqp-connection-manager";
import {
  type BaseRabbitOptions,
  type HealthAdapter,
  type AdapterResult,
  type MetadataFn,
  buildResult,
  buildErrorResult,
} from "./shared.ts";

export interface AmqpConnectionManagerAdapterOptionsWithConnection extends BaseRabbitOptions<AmqpConnectionManager> {
  connection: AmqpConnectionManager;
  urls?: never;
  connectionOptions?: never;
}

export interface AmqpConnectionManagerAdapterOptionsWithUrls extends BaseRabbitOptions<AmqpConnectionManager> {
  urls: string[];
  connectionOptions?: AmqpConnectionManagerOptions;
  connection?: never;
}

export type AmqpConnectionManagerAdapterOptions =
  | AmqpConnectionManagerAdapterOptionsWithConnection
  | AmqpConnectionManagerAdapterOptionsWithUrls;

export function amqpConnectionManagerAdapter(
  options: AmqpConnectionManagerAdapterOptions,
): HealthAdapter {
  let internalConnection: AmqpConnectionManager | null = null;

  async function getConnection(): Promise<AmqpConnectionManager> {
    if ("connection" in options && options.connection) {
      return options.connection;
    }

    if (!internalConnection) {
      const { connect } = await import("amqp-connection-manager");
      internalConnection = connect(options.urls, options.connectionOptions);
    }

    return internalConnection;
  }

  return {
    async check(): Promise<AdapterResult> {
      try {
        const connection = await getConnection();
        const start = Date.now();

        if (!connection.isConnected()) {
          throw new Error("rabbitmq adapter: connection manager has no active connections.");
        }

        const latencyMs = Date.now() - start;

        const metadataResult = options.metadata
          ? (options.metadata as MetadataFn<AmqpConnectionManager>)(connection)
          : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;

        return buildResult(latencyMs, metadata);
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
