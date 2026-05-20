import type AWS from "aws-sdk";
import type { BaseDynamoOptions, MetadataFn } from "./shared.ts";
import type { HealthAdapter, AdapterResult } from "./shared.ts";
import { buildResult, buildErrorResult } from "./shared.ts";

type DynamoDB = AWS.DynamoDB;

export interface DynamoV2AdapterOptionsWithClient extends BaseDynamoOptions<DynamoDB> {
  client: DynamoDB;
  config?: never;
}

export interface DynamoV2AdapterOptionsWithConfig extends BaseDynamoOptions<DynamoDB> {
  config?: AWS.DynamoDB.ClientConfiguration;
  client?: never;
}

export type DynamoV2AdapterOptions =
  | DynamoV2AdapterOptionsWithClient
  | DynamoV2AdapterOptionsWithConfig;

export function dynamoV2Adapter(options: DynamoV2AdapterOptions): HealthAdapter {
  let internalClient: DynamoDB | null = null;

  async function getClient(): Promise<DynamoDB> {
    if (!("client" in options) || !options.client) {
      if (!internalClient) {
        const { default: AWS } = await import("aws-sdk");
        internalClient = new AWS.DynamoDB(options.config ?? {});
      }

      return internalClient;
    }

    return options.client;
  }

  return {
    async check(): Promise<AdapterResult> {
      try {
        const client = await getClient();
        const start = Date.now();

        await new Promise<void>((resolve, reject) => {
          client.listTables({ Limit: 1 }, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });

        const latencyMs = Date.now() - start;

        const metadataResult = options.metadata
          ? (options.metadata as MetadataFn<DynamoDB>)(client)
          : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;

        return buildResult(latencyMs, metadata);
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
