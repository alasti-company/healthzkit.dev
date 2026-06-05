import type { RedisClientOptions, RedisClientType, RespVersions } from "redis";
import {
  type BaseRedisOptions,
  type HealthAdapter,
  type AdapterResult,
  DEFAULT_COMMAND,
  type MetadataFn,
  buildResult,
  buildErrorResult,
} from "./shared.ts";

type NodeRedisClient = Pick<
  RedisClientType<any, any, any, RespVersions>,
  "sendCommand" | "isOpen" | "connect"
>;

export interface NodeRedisAdapterOptionsWithClient extends BaseRedisOptions<NodeRedisClient> {
  client: NodeRedisClient;
  connectionString?: never;
  redisOptions?: never;
}

export interface NodeRedisAdapterOptionsWithConnectionString extends BaseRedisOptions<NodeRedisClient> {
  connectionString: string;
  redisOptions?: RedisClientOptions;
  client?: never;
}

export type NodeRedisAdapterOptions =
  | NodeRedisAdapterOptionsWithClient
  | NodeRedisAdapterOptionsWithConnectionString;

export function nodeRedisAdapter(options: NodeRedisAdapterOptions): HealthAdapter {
  let internalClient: NodeRedisClient | null = null;

  async function getClient(): Promise<NodeRedisClient> {
    if ("connectionString" in options && options.connectionString) {
      if (!internalClient) {
        const { createClient } = await import("redis");
        const client = createClient({
          url: options.connectionString,
          ...options.redisOptions,
        });

        await client.connect();
        internalClient = client;
      }

      return internalClient;
    }

    if ("client" in options && options.client !== undefined) {
      const client = options.client;
      if (!client.isOpen) await client.connect();
      return client;
    }

    throw new Error("nodeRedisAdapter: provide a non-empty connectionString or a client");
  }

  return {
    async check(): Promise<AdapterResult> {
      try {
        const client = await getClient();
        const start = Date.now();

        await client.sendCommand((options.command ?? DEFAULT_COMMAND).split(" "));
        const latencyMs = Date.now() - start;

        const metadataResult = options.metadata
          ? await (options.metadata as MetadataFn<NodeRedisClient>)(client)
          : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;

        return buildResult(latencyMs, metadata);
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
