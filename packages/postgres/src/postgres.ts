import type { Sql, TransactionSql } from "postgres";
import {
  buildErrorResult,
  buildResult,
  type AdapterResult,
  type BasePostgresOptions,
  type HealthAdapter,
  type MetadataFn,
} from "./shared.ts";

const DEFAULT_QUERY = "SELECT 1";

export interface PostgresJsAdapterOptionsWithClient extends BasePostgresOptions<Sql> {
  client: Sql | TransactionSql;
  connectionString?: never;
}

export interface PostgresJsAdapterOptionsWithConnectionString extends BasePostgresOptions<Sql> {
  connectionString: string;
  client?: never;
}

export type PostgresJsAdapterOptions =
  | PostgresJsAdapterOptionsWithClient
  | PostgresJsAdapterOptionsWithConnectionString;

export function postgresJsAdapter(options: PostgresJsAdapterOptions): HealthAdapter {
  let internalSql: Sql | null = null;

  async function getSql(): Promise<Sql> {
    if ("connectionString" in options && options.connectionString) {
      const postgres = await import("postgres");
      const sql = postgres.default ?? postgres;

      if (!internalSql) {
        internalSql = sql(options.connectionString, { max: 1 });
      }

      return internalSql;
    }

    return options.client as Sql;
  }

  return {
    async check(): Promise<AdapterResult> {
      try {
        const sql = await getSql();
        const start = Date.now();

        await sql.unsafe(options.query ?? DEFAULT_QUERY);
        const latencyMs = Date.now() - start;

        const metadataResult = options.metadata
          ? await (options.metadata as MetadataFn<Sql>)(sql)
          : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;

        return buildResult(latencyMs, metadata);
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
