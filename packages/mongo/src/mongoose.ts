import type { Connection, ConnectOptions, Mongoose } from "mongoose";
import {
  type BaseMongoOptions,
  type HealthAdapter,
  type AdapterResult,
  type MetadataFn,
  buildResult,
  buildErrorResult,
} from "./shared.ts";

type MongooseConnection = Connection | Mongoose;

export interface MongooseAdapterOptionsWithConnection extends BaseMongoOptions<MongooseConnection> {
  connection: MongooseConnection;
  connectionString?: never;
  mongooseOptions?: never;
}

export interface MongooseAdapterOptionsWithConnectionString extends BaseMongoOptions<MongooseConnection> {
  connectionString: string;
  mongooseOptions?: ConnectOptions;
  connection?: never;
}

export type MongooseAdapterOptions =
  | MongooseAdapterOptionsWithConnection
  | MongooseAdapterOptionsWithConnectionString;

export function mongooseAdapter(options: MongooseAdapterOptions): HealthAdapter {
  let internalConnectionPromise: Promise<MongooseConnection> | null = null;

  async function getOwnedConnection(
    connectionString: string,
    mongooseOptions?: ConnectOptions,
  ): Promise<MongooseConnection> {
    internalConnectionPromise ??= (async () => {
      const { default: mongoose } = await import("mongoose");
      await mongoose.connect(connectionString, mongooseOptions);
      return mongoose;
    })().catch((error) => {
      internalConnectionPromise = null;
      throw error;
    });

    return internalConnectionPromise;
  }

  async function getConnection(): Promise<MongooseConnection> {
    if ("connectionString" in options && options.connectionString) {
      return getOwnedConnection(options.connectionString, options.mongooseOptions);
    }

    const conn = options.connection;
    if (!conn) {
      throw new Error("mongoose adapter requires connection or connectionString");
    }

    if ("readyState" in conn && conn.readyState !== 1) {
      await conn.asPromise();
    }

    return conn;
  }

  return {
    async check(): Promise<AdapterResult> {
      try {
        const conn = await getConnection();
        const start = Date.now();

        const db = "db" in conn ? conn.db : conn.connection.db;
        await db?.admin().command({ ping: 1 });

        const latencyMs = Date.now() - start;

        const metadata = options.metadata
          ? await (options.metadata as MetadataFn<MongooseConnection>)(conn)
          : undefined;

        return buildResult(latencyMs, metadata);
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
