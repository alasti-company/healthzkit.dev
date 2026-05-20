import type { ChannelModel, Options, RecoveringChannelModel, SocketOptions } from "amqplib";
import {
  type BaseRabbitOptions,
  type HealthAdapter,
  type AdapterResult,
  type MetadataFn,
  buildResult,
  buildErrorResult,
} from "./shared.ts";

export type AmqplibClient = ChannelModel | RecoveringChannelModel;

export interface AmqplibAdapterOptionsWithConnection extends BaseRabbitOptions<AmqplibClient> {
  connection: AmqplibClient;
  url?: never;
  socketOptions?: never;
}

export interface AmqplibAdapterOptionsWithUrl extends BaseRabbitOptions<AmqplibClient> {
  url: string | Options.Connect;
  socketOptions?: SocketOptions;
  connection?: never;
}

export type AmqplibAdapterOptions =
  | AmqplibAdapterOptionsWithConnection
  | AmqplibAdapterOptionsWithUrl;

export function amqplibAdapter(options: AmqplibAdapterOptions): HealthAdapter {
  let internalConnection: AmqplibClient | null = null;
  let connectionPromise: Promise<AmqplibClient> | null = null;

  async function getConnection(): Promise<AmqplibClient> {
    if ("connection" in options && options.connection) {
      return options.connection;
    }

    if (internalConnection) {
      return internalConnection;
    }

    if (connectionPromise) {
      return connectionPromise;
    }

    connectionPromise = (async () => {
      try {
        const { default: amqplib } = await import("amqplib");
        const conn = await amqplib.connect(options.url, options.socketOptions);
        internalConnection = conn;
        return conn;
      } finally {
        connectionPromise = null;
      }
    })();

    return connectionPromise;
  }

  return {
    async check(): Promise<AdapterResult> {
      try {
        const model = await getConnection();
        const start = Date.now();

        const channel = await model.createChannel();
        await channel.close();

        const latencyMs = Date.now() - start;

        const metadataResult = options.metadata
          ? (options.metadata as MetadataFn<AmqplibClient>)(model)
          : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;

        return buildResult(latencyMs, metadata);
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
