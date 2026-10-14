import type Memcached from "memcached";
import {
  buildErrorResult,
  buildResult,
  type AdapterResult,
  type HealthAdapter,
  type MetadataFn,
} from "@healthzkit/shared";

interface BaseMemcachedOptions {
  metadata?: MetadataFn<Memcached>;
}

export interface MemcachedAdapterOptionsWithClient extends BaseMemcachedOptions {
  client: Memcached;
  servers?: never;
  options?: never;
}

export interface MemcachedAdapterOptionsWithServers extends BaseMemcachedOptions {
  servers: string | string[] | Record<string, number>;
  options?: Memcached.options;
  client?: never;
}

export type MemcachedAdapterOptions =
  | MemcachedAdapterOptionsWithClient
  | MemcachedAdapterOptionsWithServers;

/** Check every configured server using the read-only VERSION command. */
export function memcachedAdapter(options: MemcachedAdapterOptions): HealthAdapter {
  let clientPromise: Promise<Memcached> | undefined;

  async function getClient(): Promise<Memcached> {
    if (options.client !== undefined) return options.client;

    const servers = options.servers;
    const locations =
      typeof servers === "string"
        ? [servers]
        : Array.isArray(servers)
          ? servers
          : Object.keys(servers ?? {});
    if (locations.length === 0 || locations.some((server) => !server.trim())) {
      throw new Error("memcachedAdapter: provide non-empty servers or a client");
    }

    clientPromise ??= import("memcached")
      .then(
        ({ default: MemcachedClient }) =>
          new MemcachedClient(servers!, { retries: 1, ...options.options }),
      )
      .catch((error: unknown) => {
        clientPromise = undefined;
        throw error;
      });
    return clientPromise;
  }

  return {
    async check(): Promise<AdapterResult> {
      try {
        const client = await getClient();
        const start = Date.now();
        await new Promise<void>((resolve, reject) => {
          client.version((error, versions) => {
            // Some client errors are arrays rather than Error instances.
            if (Array.isArray(error) ? error.length > 0 : Boolean(error)) {
              reject(error);
            } else if (
              !Array.isArray(versions) ||
              versions.length === 0 ||
              versions.some((version) => !version || !version.version)
            ) {
              reject(new Error("memcachedAdapter: no version returned by a server"));
            } else {
              resolve();
            }
          });
        });
        const latencyMs = Date.now() - start;
        return buildResult(latencyMs, await options.metadata?.(client));
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
