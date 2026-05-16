import type { Connection, ConnectionOptions, Pool, PoolOptions } from "mysql2/promise";
import { buildErrorResult, buildResult, type BaseMysqlOptions, type MetadataFn } from "./shared.ts";
import type { HealthAdapter, AdapterResult } from "./shared.ts";

const DEFAULT_QUERY = "SELECT 1";

export interface Mysql2AdapterOptionsWithClient extends BaseMysqlOptions<Connection> {
  client: Connection | Pool;
  connectionString?: never;
  connectionOptions?: never;
}

export interface Mysql2AdapterOptionsWithConnectionString extends BaseMysqlOptions<Connection> {
  connectionString: string;
  connectionOptions: PoolOptions;
  client?: never;
}

export type Mysql2AdapterOptions =
  | Mysql2AdapterOptionsWithClient
  | Mysql2AdapterOptionsWithConnectionString;

export function mysql2Adapter(options: Mysql2AdapterOptions): HealthAdapter {
  let internalPool: Pool | null = null;
  let internalPoolInit: Promise<Pool> | null = null;

  async function getInternalPool(): Promise<Pool> {
    if (internalPool) {
      return internalPool;
    }

    if (!internalPoolInit) {
      internalPoolInit = (async () => {
        const mysql2 = await import("mysql2/promise");
        const parsed = parseConnectionString(options.connectionString!);

        internalPool = mysql2.createPool({
          ...parsed,
          ...options.connectionOptions,
        });
        return internalPool;
      })();
    }

    return internalPoolInit;
  }

  async function getConnection(): Promise<Connection> {
    if ("connectionString" in options && options.connectionString) {
      const pool = await getInternalPool();

      return await pool.getConnection();
    }

    const client = options.client;

    if (!client) {
      throw new Error("mysql2Adapter: provided a non-empty connectionString or a client");
    }

    if ("getConnection" in client && typeof client.getConnection === "function") {
      return await (client as Pool).getConnection();
    }

    return client as Connection;
  }

  return {
    async check(): Promise<AdapterResult> {
      let connection: Connection | null = null;

      try {
        connection = await getConnection();
        const start = Date.now();

        await connection.query(options.query ?? DEFAULT_QUERY);
        const latencyMs = Date.now() - start;

        const metadata = options.metadata
          ? await (options.metadata as MetadataFn<Connection>)(connection)
          : undefined;

        return buildResult(latencyMs, metadata);
      } catch (error) {
        return buildErrorResult(error);
      } finally {
        if (
          connection &&
          "release" in connection &&
          typeof (connection as unknown as { release: () => void }).release === "function"
        ) {
          (connection as unknown as { release: () => void }).release();
        }
      }
    },
  };
}

function parseConnectionString(connectionString: string): ConnectionOptions {
  const url = new URL(connectionString);

  const protocol = url.protocol.replace(":", "");
  if (protocol !== "mysql" && protocol !== "mysql2") {
    throw new Error(
      `mysql2Adapter: invalid protocol in connection string: ${protocol}. expeceted mysql:// or mysql2://`,
    );
  }

  return {
    host: url.hostname,
    port: url.port ? parseInt(url.port, 10) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  };
}
