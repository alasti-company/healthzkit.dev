import type { Redis, RedisOptions } from "ioredis";
import { buildErrorResult, buildResult, DEFAULT_COMMAND, type BaseRedisOptions } from "./shared.ts";
import type { HealthAdapter, AdapterResult, MetadataFn } from "./shared.ts";

export interface IoRedisAdapterOptionsWithClient extends BaseRedisOptions<Redis> {
  client: Redis;
  connectionString?: never;
  redisOptions?: never;
}

export interface IoRedisAdapterOptionsWithConnectionString extends BaseRedisOptions<Redis> {
  connectionString: string;
  redisOptions?: RedisOptions;
  client?: never;
}

export type IoRedisAdapterOptions =
  | IoRedisAdapterOptionsWithClient
  | IoRedisAdapterOptionsWithConnectionString;

export function ioredisAdapter(options: IoRedisAdapterOptions): HealthAdapter {
  let internalClient: Redis | null = null;

  async function getClient(): Promise<Redis> {
    if ("connectionString" in options && options.connectionString) {
      if (!internalClient) {
        const { Redis } = await import("ioredis");
        internalClient = new Redis(options.connectionString, {
          maxRetriesPerRequest: 1,
          enableReadyCheck: false,
          ...options.redisOptions,
        });
      }

      return internalClient;
    }

    if ("client" in options && options.client !== undefined) {
      return options.client;
    }

    throw new Error("ioredisAdapter: provide a non-empty connectionString or a client");
  }

  return {
    async check(): Promise<AdapterResult> {
      try {
        const client = await getClient();
        const start = Date.now();

        await client.call(options.command ?? DEFAULT_COMMAND);
        const latencyMs = Date.now() - start;

        const metadataResult = options.metadata
          ? await (options.metadata as MetadataFn<Redis>)(client)
          : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;

        return buildResult(latencyMs, metadata);
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
