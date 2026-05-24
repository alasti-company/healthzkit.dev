import type { S3Client, S3ClientConfig, ListBucketsCommandOutput } from "@aws-sdk/client-s3";
import type { BaseS3Options, MetadataFn } from "./shared.ts";
import type { HealthAdapter, AdapterResult } from "./shared.ts";
import { buildResult, buildErrorResult } from "./shared.ts";

export interface S3V3AdapterOptionsWithClient extends BaseS3Options<S3Client> {
  client: S3Client;
  config?: never;
}

export interface S3V3AdapterOptionsWithConfig extends BaseS3Options<S3Client> {
  config?: S3ClientConfig;
  client?: never;
}

export type S3V3AdapterOptions = S3V3AdapterOptionsWithClient | S3V3AdapterOptionsWithConfig;

export function s3V3Adapter(options: S3V3AdapterOptions): HealthAdapter {
  let internalClient: S3Client | null = null;

  async function getClient(): Promise<S3Client> {
    if ("client" in options && options.client) {
      return options.client;
    }

    if (!internalClient) {
      const { S3Client } = await import("@aws-sdk/client-s3");
      internalClient = new S3Client(options.config ?? {});
    }

    return internalClient;
  }

  return {
    async check(): Promise<AdapterResult> {
      try {
        const client = await getClient();
        const start = Date.now();

        const { ListBucketsCommand } = await import("@aws-sdk/client-s3");
        const response: ListBucketsCommandOutput = await client.send(new ListBucketsCommand({}));
        const latencyMs = Date.now() - start;

        const metadataResult = options.metadata
          ? (options.metadata as MetadataFn<S3Client>)(client)
          : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;

        return buildResult(latencyMs, { bucketCount: response.Buckets?.length, ...metadata });
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
