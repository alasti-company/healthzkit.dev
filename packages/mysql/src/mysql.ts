import type { Connection, ConnectionConfig, Pool } from "mysql";
import type { BaseMysqlOptions, MetadataFn } from "./shared.ts";
import type { HealthAdapter, AdapterResult } from "./shared.ts";
import { buildResult, buildErrorResult } from "./shared.ts";

const DEFAULT_QUERY = "SELECT 1";

export interface MysqlAdapterOptionsWithClient extends BaseMysqlOptions<Connection> {
  client: Connection | Pool;
  connectionString?: never;
  connectionOptions?: never;
}

export interface MysqlAdapterOptionsWithConnectionString extends BaseMysqlOptions<Connection> {
  connectionString: string;
  connectionOptions?: Omit<ConnectionConfig, "host" | "port" | "user" | "password" | "database">;
  client?: never;
}

export type MysqlAdapterOptions =
  | MysqlAdapterOptionsWithClient
  | MysqlAdapterOptionsWithConnectionString;

export function mysqlAdapter(options: MysqlAdapterOptions): HealthAdapter {
  let internalPool: Pool | null = null;
  let internalPoolInit: Promise<Pool> | null = null;

  async function getInternalPool(): Promise<Pool> {
    if (internalPool) {
      return internalPool;
    }

    if (!internalPoolInit) {
      internalPoolInit = (async () => {
        const mysql = await import("mysql");
        const parsed = parseConnectionString(options.connectionString!);

        internalPool = mysql.createPool({
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

      return new Promise((resolve, reject) => {
        pool.getConnection((err, connection) => {
          if (err) reject(err);
          else resolve(connection);
        });
      });
    }

    const client = options.client;
    if (!client) {
      throw new Error("mysqlAdapter: provided a non-empty connectionString or a client");
    }

    if ("getConnection" in client && typeof client.getConnection === "function") {
      return new Promise((resolve, reject) => {
        (client as Pool).getConnection((err, connection) => {
          if (err) reject(err);
          else resolve(connection);
        });
      });
    }

    return client as Connection;
  }

  return {
    async check(): Promise<AdapterResult> {
      let connection: Connection | null = null;

      try {
        connection = await getConnection();
        const start = Date.now();

        await new Promise<unknown>((resolve, reject) => {
          connection!.query(options.query ?? DEFAULT_QUERY, (err, results) => {
            if (err) reject(err);
            else resolve(results);
          });
        });

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

function parseConnectionString(
  connectionString: string,
): Pick<ConnectionConfig, "host" | "port" | "user" | "password" | "database"> {
  const url = new URL(connectionString);
  const protocol = url.protocol.replace(":", "");

  if (protocol !== "mysql" && protocol !== "mysql2") {
    throw new Error(
      `mysqlAdapter: invalid protocol in connectionString: ${protocol}. expected mysql:// or mysql2://`,
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
