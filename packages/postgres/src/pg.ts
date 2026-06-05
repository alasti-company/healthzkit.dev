import type { Pool, PoolClient, ClientBase } from "pg";
import type { BasePostgresOptions, MetadataFn } from "./shared.ts";
import type { HealthAdapter, AdapterResult } from "./shared.ts";
import { buildResult, buildErrorResult } from "./shared.ts";

const DEFAULT_QUERY = "SELECT 1";

export interface PgAdapterOptionsWithClent extends BasePostgresOptions<ClientBase> {
  client: Pool | PoolClient | ClientBase;
  connectionString?: never;
}

export interface PgAdapterOptionsWithConnectionString extends BasePostgresOptions<ClientBase> {
  connectionString: string;
  client?: never;
}

export type PgAdapterOptions = PgAdapterOptionsWithClent | PgAdapterOptionsWithConnectionString;

export function pgAdapter(options: PgAdapterOptions): HealthAdapter {
  let internalPool: Pool | null = null;

  async function getClient(): Promise<{
    client: ClientBase;
    release: () => void;
  }> {
    if ("connectionString" in options && options.connectionString) {
      const { Pool } = await import("pg");

      if (!internalPool) {
        internalPool = new Pool({
          connectionString: options.connectionString,
          max: 1,
        });
      }

      const poolClient: PoolClient = await internalPool.connect();
      return { client: poolClient, release: () => poolClient.release() };
    }

    const pool = options.client as Pool;

    if ("connect" in pool && typeof pool.connect === "function") {
      const poolClient: PoolClient = await pool.connect();
      return { client: poolClient, release: () => poolClient.release() };
    }

    return { client: options.client as ClientBase, release: () => {} };
  }

  return {
    async check(): Promise<AdapterResult> {
      let release: () => void = () => {};

      try {
        const start = Date.now();
        const { client, release: releaseClient } = await getClient();
        release = releaseClient;

        await client.query(options.query ?? DEFAULT_QUERY);
        const latencyMs = Date.now() - start;

        const metadataResult = options.metadata
          ? await (options.metadata as MetadataFn<ClientBase>)(client)
          : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;

        return buildResult(latencyMs, metadata);
      } catch (error) {
        return buildErrorResult(error);
      } finally {
        release();
      }
    },
  };
}
