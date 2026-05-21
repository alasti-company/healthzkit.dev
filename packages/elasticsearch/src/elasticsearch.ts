import type { Client } from "@elastic/elasticsearch";
import type { ClientOptions } from "@elastic/elasticsearch/lib/client";
import {
  type BaseElasticsearchOptions,
  type HealthAdapter,
  type AdapterResult,
  type MetadataFn,
  buildErrorResult,
} from "./shared.ts";

export interface ElasticsearchAdapterOptionsWithClient extends BaseElasticsearchOptions<Client> {
  client: Client;
  config?: never;
}

export interface ElasticsearchAdapterOptionsWithConfig extends BaseElasticsearchOptions<Client> {
  config?: ClientOptions;
  client?: never;
}

export type ElasticsearchAdapterOptions =
  | ElasticsearchAdapterOptionsWithClient
  | ElasticsearchAdapterOptionsWithConfig;

export function elasticsearchAdapter(options: ElasticsearchAdapterOptions): HealthAdapter {
  let internalClient: Client | null = null;

  async function getClient(): Promise<Client> {
    if ("client" in options && options.client) {
      return options.client;
    }

    if (!internalClient) {
      const { Client } = await import("@elastic/elasticsearch");
      internalClient = new Client(options.config ?? { node: "http://localhost:9200" });
    }

    return internalClient;
  }

  return {
    async check(): Promise<AdapterResult> {
      try {
        const client = await getClient();
        const start = Date.now();

        const response = await client.cluster.health();
        const latencyMs = Date.now() - start;

        const esStatus = response.status;
        const status = esStatus === "red" ? "fail" : esStatus === "yellow" ? "degraded" : "ok";

        const metadataResult = options.metadata
          ? (options.metadata as MetadataFn<Client>)(client)
          : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;

        return {
          status,
          metadata: {
            latencyMs,
            clusterStatus: esStatus,
            clusterName: response.cluster_name,
            numberOfNodes: response.number_of_data_nodes,
            ...metadata,
          },
        };
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
