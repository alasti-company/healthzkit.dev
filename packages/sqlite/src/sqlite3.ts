import type { Database } from "sqlite3";
import { buildErrorResult, buildResult, DEFAULT_QUERY, type BaseSqliteOptions } from "./shared.ts";
import type { HealthAdapter, AdapterResult, MetadataFn } from "./shared.ts";

export interface Sqlite3AdapterOptionsWithClient extends BaseSqliteOptions<Database> {
  client: Database;
  connectionString?: never;
  mode?: never;
}

export interface Sqlite3AdapterOptionsWithConnectionString extends BaseSqliteOptions<Database> {
  connectionString: string;
  mode?: number;
  client?: never;
}

export type Sqlite3AdapterOptions =
  | Sqlite3AdapterOptionsWithClient
  | Sqlite3AdapterOptionsWithConnectionString;

export function sqlite3Adapter(options: Sqlite3AdapterOptions): HealthAdapter {
  let internalDb: Database | null = null;
  let internalDbInit: Promise<Database> | null = null;

  async function getClient(): Promise<Database> {
    if ("connectionString" in options && options.connectionString) {
      if (internalDb) {
        return internalDb;
      }

      if (!internalDbInit) {
        internalDbInit = (async () => {
          try {
            const { default: sqlite3 } = await import("sqlite3");

            const db = await new Promise<Database>((resolve, reject) => {
              const mode = options.mode ?? sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE;
              const database = new sqlite3.Database(options.connectionString, mode, (error) => {
                if (error) {
                  reject(error);
                  return;
                }
                queueMicrotask(() => resolve(database));
              });
            });
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

    throw new Error("sqlite3Adapter: provide a non-empty connectionString or a client");
  }

  return {
    async check(): Promise<AdapterResult> {
      try {
        const client = await getClient();
        const start = Date.now();

        await new Promise<void>((resolve, reject) => {
          client.get(options.query ?? DEFAULT_QUERY, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        const latencyMs = Date.now() - start;

        const metadataResult = options.metadata
          ? (options.metadata as MetadataFn<Database>)(client)
          : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;

        return buildResult(latencyMs, metadata);
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
