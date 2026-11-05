import type { DynamoDBClient, DynamoDBClientConfig } from "@aws-sdk/client-dynamodb";
import type { BaseDynamoOptions, MetadataFn } from "./shared.ts";
import type { HealthAdapter, AdapterResult } from "./shared.ts";
import { buildResult, buildErrorResult } from "./shared.ts";

export interface DynamoV3AdapterOptionsWithClient extends BaseDynamoOptions<DynamoDBClient> {
  client: DynamoDBClient;
  config?: never;
}

export interface DynamoV3AdapterOptionsWithConfig extends BaseDynamoOptions<DynamoDBClient> {
  config?: DynamoDBClientConfig;
  client?: never;
}

export type DynamoV3AdapterOptions =
  | DynamoV3AdapterOptionsWithClient
  | DynamoV3AdapterOptionsWithConfig;

export function dynamoV3Adapter(options: DynamoV3AdapterOptions): HealthAdapter {
  let internalClient: DynamoDBClient | null = null;

  async function getClient(): Promise<DynamoDBClient> {
    if (!("client" in options) || !options.client) {
      if (!internalClient) {
        const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
        internalClient = new DynamoDBClient(options.config ?? {});
      }

      return internalClient;
    }

    return options.client;
  }

  return {
    async check(context): Promise<AdapterResult> {
      try {
        context?.signal.throwIfAborted();
        const client = await getClient();
        const start = Date.now();

        const { ListTablesCommand } = await import("@aws-sdk/client-dynamodb");

        context?.signal.throwIfAborted();
        await client.send(new ListTablesCommand({ Limit: 1 }), { abortSignal: context?.signal });
        context?.signal.throwIfAborted();
        const latencyMs = Date.now() - start;

        const metadataResult = options.metadata
          ? (options.metadata as MetadataFn<DynamoDBClient>)(client)
          : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;
        context?.signal.throwIfAborted();

        return buildResult(latencyMs, metadata);
      } catch (error) {
        return buildErrorResult(context?.signal.aborted ? context.signal.reason : error);
      }
    },
  };
}
