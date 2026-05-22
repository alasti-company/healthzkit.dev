import type { MySqlDatabase } from "drizzle-orm/mysql-core";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { DrizzleInstance } from "./extract.ts";
import type { BaseDrizzleOptions } from "./shared.ts";
import type { HealthAdapter, AdapterResult } from "./shared.ts";
import { extractClient, detectDriver } from "./extract.ts";
import { buildResult, buildErrorResult } from "./shared.ts";

const DEFAULT_QUERY = "SELECT 1";

async function runHealthQuery(
  db: DrizzleInstance,
  driver: "pg" | "mysql" | "sqlite" | "unknown",
  query: string,
): Promise<void> {
  switch (driver) {
    case "pg": {
      await (db as PgDatabase<never>).execute(query);
      return;
    }
    case "mysql": {
      await (db as MySqlDatabase<never, never>).execute(query);
      return;
    }
    case "sqlite": {
      const result: unknown = (db as BaseSQLiteDatabase<never, never>).run(query);
      if (result instanceof Promise) {
        await result;
      }
      return;
    }
    default: {
      await (db as PgDatabase<never>).execute(query);
    }
  }
}

export interface DrizzleAdapterOptions<
  TDb extends DrizzleInstance = DrizzleInstance,
  TClient = unknown,
> extends BaseDrizzleOptions<TClient> {
  db: TDb;
  /**
   * Override auto-detected driver type.
   */
  driver?: "pg" | "mysql" | "sqlite";
  /**
   * Custom query to run. Defaults to "SELECT_1".
   */
  query?: string;
}

export function drizzleAdapter<TDb extends DrizzleInstance, TClient = unknown>(
  options: DrizzleAdapterOptions<TDb, TClient>,
): HealthAdapter {
  return {
    async check(): Promise<AdapterResult> {
      try {
        const db = options.db;
        const driver = options.driver ?? detectDriver(db);
        const client = extractClient(db);
        const start = Date.now();

        await runHealthQuery(db, driver, options.query ?? DEFAULT_QUERY);

        const latencyMs = Date.now() - start;
        const metadataResult =
          options.metadata && client !== undefined
            ? options.metadata(client as TClient)
            : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;

        return buildResult(latencyMs, metadata);
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
