import type AWS from "aws-sdk";
import type { BaseS3Options, MetadataFn } from "./shared.ts";
import type { HealthAdapter, AdapterResult } from "./shared.ts";
import { buildResult, buildErrorResult } from "./shared.ts";

type S3V2 = AWS.S3;

export interface S3V2AdapterOptionsWithClient extends BaseS3Options<S3V2> {
  client: S3V2;
  config?: never;
}

export interface S3V2AdapterOptionsWithConfig extends BaseS3Options<S3V2> {
  config?: AWS.S3.ClientConfiguration;
  client?: never;
}

export type S3V2AdapterOptions = S3V2AdapterOptionsWithClient | S3V2AdapterOptionsWithConfig;

export function s3V2Adapter(options: S3V2AdapterOptions): HealthAdapter {
  let internalClient: S3V2 | null = null;

  async function getClient(): Promise<S3V2> {
    if ("client" in options && options.client) {
      return options.client;
    }

    if (!internalClient) {
      const { default: AWS } = await import("aws-sdk");
      internalClient = new AWS.S3(options.config ?? {});
    }

    return internalClient;
  }

  return {
    async check(): Promise<AdapterResult> {
      try {
        const client = await getClient();
        const start = Date.now();

        const response = await new Promise<AWS.S3.ListBucketsOutput>((resolve, reject) => {
          client.listBuckets((error, data) => {
            if (error) reject(error);
            else resolve(data);
          });
        });

        const latencyMs = Date.now() - start;

        const metadataResult = options.metadata
          ? (options.metadata as MetadataFn<S3V2>)(client)
          : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;
        const bucketCount = response.Buckets?.length ?? 0;

        return buildResult(latencyMs, { ...metadata, bucketCount });
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
