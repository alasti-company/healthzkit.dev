import type { Pool, PoolClient, ClientBase } from "pg";
import { buildResult, buildErrorResult, DEFAULT_QUERY } from "./shared.ts";
import {
  type BaseCockroachOptions,
  type HealthAdapter,
  type AdapterResult,
  type MetadataFn,
} from "./shared.ts";

export interface CockroachPgAdapterOptionsWithClient extends BaseCockroachOptions<ClientBase> {
  client: Pool | PoolClient | ClientBase;
  connectionString?: never;
  pgOptions?: never;
}

export interface CockroachPgAdapterOptionsWithConfig extends BaseCockroachOptions<ClientBase> {
  connectionString: string;
  pgOption?: Omit<ConstructorParameters<typeof Pool>[0], "connectionString">;
  client?: never;
}

export type CockroachPgAdapterOptions =
  | CockroachPgAdapterOptionsWithClient
  | CockroachPgAdapterOptionsWithConfig;

export function cockroachPgAdapter(options: CockroachPgAdapterOptions): HealthAdapter {
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
          ...options.pgOption,
        });
      }

      const poolClient: PoolClient = await internalPool?.connect();
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
