import type {
  Producer as RdProducer,
  KafkaConsumer as RdConsumer,
  ProducerGlobalConfig,
  LibrdKafkaError,
} from "node-rdkafka";
import type { BaseKafkaOptions, MetadataFn } from "./shared.ts";
import type { HealthAdapter, AdapterResult } from "./shared.ts";
import { buildResult, buildErrorResult } from "./shared.ts";

type RdKafkaClient = RdProducer | RdConsumer;

export interface NodeRdKafkaOptionsWithClient extends BaseKafkaOptions<RdKafkaClient> {
  client: RdKafkaClient;
  config?: never;
}

export interface NodeRdKafkaOptionsWithConfig extends BaseKafkaOptions<RdKafkaClient> {
  config: ProducerGlobalConfig;
  client?: never;
}

export type NodeRdKafkaAdapterOptions = NodeRdKafkaOptionsWithClient | NodeRdKafkaOptionsWithConfig;

function fetchMetadata(client: RdKafkaClient): Promise<void> {
  return new Promise((resolve, reject) => {
    const onMetadata = (err: LibrdKafkaError | undefined) => {
      if (err) reject(err);
      else resolve();
    };

    if (client.isConnected()) {
      client.getMetadata({}, onMetadata);
      return;
    }

    client.connect({}, (err) => {
      if (err) {
        reject(err);
        return;
      }
      client.getMetadata({}, onMetadata);
    });
  });
}

export function nodeRdKafkaAdapter(options: NodeRdKafkaAdapterOptions): HealthAdapter {
  let internalClient: RdProducer | null = null;

  async function getClient(): Promise<RdKafkaClient> {
    if ("client" in options && options.client) {
      return options.client;
    }

    if (!internalClient) {
      const { Producer } = await import("node-rdkafka");
      internalClient = new Producer(options.config);
    }

    return internalClient;
  }

  return {
    async check(): Promise<AdapterResult> {
      try {
        const client = await getClient();
        const start = Date.now();

        await fetchMetadata(client);

        const latencyMs = Date.now() - start;
        const metadataResult = options.metadata
          ? (options.metadata as MetadataFn<RdKafkaClient>)(client)
          : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;

        return buildResult(latencyMs, metadata);
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
