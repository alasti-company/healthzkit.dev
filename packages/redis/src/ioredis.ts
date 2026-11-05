import { withDisposal } from "@healthzkit/shared";
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

  let ownedInit: ReturnType<typeof resolveClient> | undefined;
  function getClient(): ReturnType<typeof resolveClient> {
    if (options.client) return resolveClient();
    ownedInit ??= resolveClient().catch((error: unknown) => {
      ownedInit = undefined;
      throw error;
    });
    return ownedInit;
  }

  async function resolveClient(): Promise<Redis> {
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

  return withDisposal(
    {
      async check(): Promise<AdapterResult> {
        try {
          const [command, ...args] = (options.command ?? DEFAULT_COMMAND).trim().split(/\s+/);
          if (!command) {
            throw new Error("ioredisAdapter: command must not be empty");
          }

          const client = await getClient();
          const start = Date.now();

          await client.call(command, ...args);
          const latencyMs = Date.now() - start;

          const metadataResult = options.metadata
            ? (options.metadata as MetadataFn<Redis>)(client)
            : undefined;
          const metadata =
            metadataResult instanceof Promise ? await metadataResult : metadataResult;

          return buildResult(latencyMs, metadata);
        } catch (error) {
          return buildErrorResult(error);
        }
      },
    },
    async () => {
      internalClient?.disconnect();
    },
  );
}
