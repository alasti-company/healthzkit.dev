import type { Client, ClientOptions } from "minio";
import type { BaseMinioOptions, MetadataFn } from "./shared.ts";
import type { HealthAdapter, AdapterResult } from "./shared.ts";
import { buildResult, buildErrorResult } from "./shared.ts";

export interface MinioAdapterOptionsWithClient extends BaseMinioOptions<Client> {
  client: Client;
  config?: never;
}

export interface MinioAdapterOptionsWithConfig extends BaseMinioOptions<Client> {
  config: ClientOptions;
  client?: never;
}

export type MinioAdapterOptions = MinioAdapterOptionsWithClient | MinioAdapterOptionsWithConfig;

export function minioAdapter(options: MinioAdapterOptions): HealthAdapter {
  let internalClient: Client | null = null;

  async function getClient(): Promise<Client> {
    if ("client" in options && options.client) {
      return options.client;
    }

    if (!internalClient) {
      const { Client } = await import("minio");
      internalClient = new Client(options.config);
    }

    return internalClient;
  }

  return {
    async check(): Promise<AdapterResult> {
      try {
        const client = await getClient();
        const start = Date.now();

        await client.listBuckets();
        const latencyMs = Date.now() - start;

        const metadataResult = options.metadata
          ? (options.metadata as MetadataFn<Client>)(client)
          : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;

        return buildResult(latencyMs, metadata);
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
