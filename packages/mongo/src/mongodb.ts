import type { MongoClient, MongoClientOptions } from "mongodb";
import {
  type BaseMongoOptions,
  type HealthAdapter,
  type AdapterResult,
  type MetadataFn,
  buildResult,
  buildErrorResult,
} from "./shared.ts";

export interface MongoDbAdapterOptionsWithClient extends BaseMongoOptions<MongoClient> {
  client: MongoClient;
  connectionString?: never;
  mongoOptions?: never;
}

export interface MongoDbAdapterOptionsWithConnectionString extends BaseMongoOptions<MongoClient> {
  connectionString: string;
  mongoOptions?: MongoClientOptions;
  client?: never;
}

export type MongoDbAdapterOptions =
  | MongoDbAdapterOptionsWithClient
  | MongoDbAdapterOptionsWithConnectionString;

export type MongoDbAdapter = HealthAdapter & {
  close(): Promise<void>;
};

export function mongodbAdapter(options: MongoDbAdapterOptions): MongoDbAdapter {
  let internalClient: MongoClient | null = null;
  let ownedConnectPromise: Promise<MongoClient> | null = null;
  let injectedConnectPromise: Promise<void> | null = null;

  async function getOwnedClient(
    connectionString: string,
    mongoOptions?: MongoClientOptions,
  ): Promise<MongoClient> {
    ownedConnectPromise ??= (async () => {
      const { MongoClient } = await import("mongodb");
      const client = new MongoClient(connectionString, mongoOptions);
      await client.connect();
      internalClient = client;
      return client;
    })().catch((error) => {
      ownedConnectPromise = null;
      internalClient = null;
      throw error;
    });

    return ownedConnectPromise;
  }

  async function getClient(): Promise<MongoClient> {
    if ("connectionString" in options && options.connectionString) {
      return getOwnedClient(options.connectionString, options.mongoOptions);
    }

    if ("client" in options && options.client) {
      injectedConnectPromise ??= options.client
        .connect()
        .then(() => undefined)
        .catch((error) => {
          injectedConnectPromise = null;
          throw error;
        });
      await injectedConnectPromise;
      return options.client;
    }

    throw new Error("mongoAdapter: provide a non-empty connectionString or a client");
  }

  return {
    async check(): Promise<AdapterResult> {
      try {
        const client = await getClient();
        const start = Date.now();

        await client.db("admin").command({ ping: 1 });
        const latencyMs = Date.now() - start;

        const metadataResult = options.metadata
          ? (options.metadata as MetadataFn<MongoClient>)(client)
          : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;

        return buildResult(latencyMs, metadata);
      } catch (error) {
        return buildErrorResult(error);
      }
    },

    async close(): Promise<void> {
      if (!internalClient) {
        return;
      }

      await internalClient.close();
      internalClient = null;
      ownedConnectPromise = null;
    },
  };
}
