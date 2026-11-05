import { withDisposal } from "@healthzkit/shared";
import type { RedisClientOptions } from "redis";
import {
  type BaseRedisOptions,
  type HealthAdapter,
  type AdapterResult,
  DEFAULT_COMMAND,
  type MetadataFn,
  buildResult,
  buildErrorResult,
} from "./shared.ts";

// Keep the public client contract compatible with Redis 4, 5 and 6. Their
// RedisClientType generics and exported RESP types differ between major versions.
interface NodeRedisClient {
  readonly isOpen: boolean;
  connect(): Promise<unknown>;
  sendCommand(args: string[]): Promise<unknown>;
}

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
  let internalClient: ReturnType<(typeof import("redis"))["createClient"]> | null = null;

  let ownedInit: ReturnType<typeof resolveClient> | undefined;
  function getClient(): ReturnType<typeof resolveClient> {
    if (options.client) return resolveClient();
    ownedInit ??= resolveClient().catch((error: unknown) => {
      ownedInit = undefined;
      throw error;
    });
    return ownedInit;
  }

  async function resolveClient(): Promise<NodeRedisClient> {
    if ("connectionString" in options && options.connectionString) {
      if (!internalClient) {
        const { createClient } = await import("redis");
        const client = createClient({
          url: options.connectionString,
          ...options.redisOptions,
        });

        internalClient = client;
      }
      if (!internalClient.isOpen) await internalClient.connect();

      return internalClient;
    }

    if ("client" in options && options.client !== undefined) {
      const client = options.client;
      if (!client.isOpen) await client.connect();
      return client;
    }

    throw new Error("nodeRedisAdapter: provide a non-empty connectionString or a client");
  }

  return withDisposal(
    {
      async check(): Promise<AdapterResult> {
        try {
          const client = await getClient();
          const start = Date.now();

          await client.sendCommand((options.command ?? DEFAULT_COMMAND).split(" "));
          const latencyMs = Date.now() - start;

          const metadataResult = options.metadata
            ? (options.metadata as MetadataFn<NodeRedisClient>)(client)
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
      if (internalClient?.isOpen) await internalClient.quit();
    },
  );
}
