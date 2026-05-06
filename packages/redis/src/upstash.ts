import {
  type BaseRedisOptions,
  type HealthAdapter,
  type AdapterResult,
  DEFAULT_COMMAND,
  type MetadataFn,
  buildResult,
  buildErrorResult,
} from "./shared.ts";
import type { Redis as UpstashRedis } from "@upstash/redis";

export interface UpstashAdapterOptionsWithClient extends BaseRedisOptions<UpstashRedis> {
  client: UpstashRedis;
  url?: never;
  token?: never;
}

export interface UpstashAdapterOptionsWithCredentials extends BaseRedisOptions<UpstashRedis> {
  url: string;
  token: string;
  client?: never;
}

export type UpstashAdapterOptions =
  | UpstashAdapterOptionsWithClient
  | UpstashAdapterOptionsWithCredentials;

export function upstashAdapter(options: UpstashAdapterOptions): HealthAdapter {
  let internalClient: UpstashRedis | null = null;

  async function getClient(): Promise<UpstashRedis> {
    if ("url" in options && options.url) {
      if (!internalClient) {
        const { Redis } = await import("@upstash/redis");
        internalClient = new Redis({
          url: options.url,
          token: options.token,
        });
      }

      return internalClient;
    }

    if ("client" in options && options.client !== undefined) {
      return options.client;
    }

    throw new Error("upstashAdapter: provide url and token, or a client");
  }

  return {
    async check(): Promise<AdapterResult> {
      try {
        const client = await getClient();
        const start = Date.now();

        if (options.command && options.command !== DEFAULT_COMMAND) {
          const [cmd, ...args] = options.command.split(" ");
          await client.exec([cmd, ...args]);
        } else {
          await client.ping();
        }

        const latencyMs = Date.now() - start;

        const metadata = options.metadata
          ? await (options.metadata as MetadataFn<UpstashRedis>)(client)
          : undefined;

        return buildResult(latencyMs, metadata);
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
