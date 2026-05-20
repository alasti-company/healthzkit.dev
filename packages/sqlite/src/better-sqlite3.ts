import type BetterSqlite3Constructor from "better-sqlite3";
import type { Database as SqliteDatabase } from "better-sqlite3";
import {
  type BaseSqliteOptions,
  type HealthAdapter,
  type AdapterResult,
  DEFAULT_QUERY,
  type MetadataFn,
  buildResult,
  buildErrorResult,
} from "./shared.ts";

type BetterSqlite3OpenOptions = NonNullable<
  ConstructorParameters<typeof BetterSqlite3Constructor>[1]
>;

export interface BetterSqlite3AdapterOptionsWithClient extends BaseSqliteOptions<SqliteDatabase> {
  client: SqliteDatabase;
  connectionString?: never;
  options?: never;
}

export interface BetterSqlite3AdapterOptionsWithConnectionString extends BaseSqliteOptions<SqliteDatabase> {
  connectionString: string;
  options?: BetterSqlite3OpenOptions;
  client?: never;
}

export type BetterSqlite3AdapterOptions =
  | BetterSqlite3AdapterOptionsWithClient
  | BetterSqlite3AdapterOptionsWithConnectionString;

export function betterSqlite3Adapter(options: BetterSqlite3AdapterOptions): HealthAdapter {
  let internalDb: SqliteDatabase | null = null;
  let internalDbInit: Promise<SqliteDatabase> | null = null;

  async function getClient(): Promise<SqliteDatabase> {
    if ("connectionString" in options && options.connectionString) {
      if (internalDb) {
        return internalDb;
      }

      if (!internalDbInit) {
        internalDbInit = (async () => {
          try {
            const { default: DatabaseCtor } = await import("better-sqlite3");
            const db = new DatabaseCtor(options.connectionString, options.options);
            internalDb = db;
            return db;
          } finally {
            internalDbInit = null;
          }
        })();
      }

      return internalDbInit;
    }

    if ("client" in options && options.client !== undefined) {
      return options.client;
    }

    throw new Error("betterSqlite3Adapter: provide a non-empty connectionString or a client");
  }

  return {
    async check(): Promise<AdapterResult> {
      try {
        const client = await getClient();
        const start = Date.now();

        client.prepare(options.query ?? DEFAULT_QUERY).get();
        const latencyMs = Date.now() - start;

        const metadataResult = options.metadata
          ? (options.metadata as MetadataFn<SqliteDatabase>)(client)
          : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;

        return buildResult(latencyMs, metadata);
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
