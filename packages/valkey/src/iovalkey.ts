import type { Redis, RedisOptions } from "iovalkey";
import {
  buildErrorResult,
  buildResult,
  DEFAULT_COMMAND,
  type BaseValkeyOptions,
} from "./shared.ts";
import type { AdapterResult, HealthAdapter, MetadataFn } from "./shared.ts";

export interface IoValkeyAdapterOptionsWithClient extends BaseValkeyOptions<Redis> {
  client: Redis;
  connectionString?: never;
  options?: never;
}

export interface IoValkeyAdapterOptionsWithConnectionString extends BaseValkeyOptions<Redis> {
  connectionString: string;
  options?: RedisOptions;
  client?: never;
}

export type IoValkeyAdapterOptions =
  | IoValkeyAdapterOptionsWithClient
  | IoValkeyAdapterOptionsWithConnectionString;

export function iovalkeyAdapter(options: IoValkeyAdapterOptions): HealthAdapter {
  let internalClient: Redis | null = null;

  async function getClient(): Promise<Redis> {
    if ("connectionString" in options && options.connectionString) {
      if (!internalClient) {
        const { Redis } = await import("iovalkey");
        internalClient = new Redis(options.connectionString, {
          maxRetriesPerRequest: 1,
          enableReadyCheck: false,
          ...options.options,
        });
      }

      return internalClient;
    }

    if ("client" in options && options.client !== undefined) {
      return options.client;
    }

    throw new Error("iovalkeyAdapter: provide a non-empty connectionString or a client");
  }

  return {
    async check(): Promise<AdapterResult> {
      try {
        const client = await getClient();
        const start = Date.now();

        await client.call(options.command ?? DEFAULT_COMMAND);
        const latencyMs = Date.now() - start;

        const metadataResult = options.metadata
          ? (options.metadata as MetadataFn<Redis>)(client)
          : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;

        return buildResult(latencyMs, metadata);
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
