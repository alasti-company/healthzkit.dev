import type { PgDatabase } from "drizzle-orm/pg-core";
import type { MySqlDatabase } from "drizzle-orm/mysql-core";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

interface WithSession {
  session: {
    client: unknown;
    // pg-specific
    query?: unknown;
    // mysql-specific
    execute?: unknown;
    // sqlite-specific
    syncRun?: unknown;
    run?: unknown;
  };
}

export type DrizzleInstance =
  | PgDatabase<any>
  | MySqlDatabase<any, any>
  | BaseSQLiteDatabase<any, any>;

/**
 * Opaque handle to the driver client behind a Drizzle instance.
 * This package does not depend on pg, mysql2, etc. — consumers who need
 * typed metadata should pass a `TClient` generic on `drizzleAdapter`.
 */
export type UnderlyingClient = unknown;

export function extractClient(db: DrizzleInstance): unknown {
  const session = (db as unknown as WithSession).session;
  return session?.client;
}

export function detectDriver(db: DrizzleInstance): "pg" | "mysql" | "sqlite" | "unknown" {
  const session = (db as unknown as WithSession).session;

  if (!session) return "unknown";

  if (
    "execute" in session ||
    (session.client && typeof (session.client as { execute?: unknown }).execute === "function")
  ) {
    return "mysql";
  }

  if (
    "query" in session ||
    (session.client && typeof (session.client as { query?: unknown }).query === "function")
  ) {
    return "pg";
  }

  if (
    "syncRun" in session ||
    "run" in session ||
    (session.client && typeof (session.client as { prepare?: unknown }).prepare === "function")
  ) {
    return "sqlite";
  }

  return "unknown";
}
