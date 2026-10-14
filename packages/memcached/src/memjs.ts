import type { Client, ClientOptions, ServerOptions } from "memjs";
import {
  buildErrorResult,
  buildResult,
  type AdapterResult,
  type HealthAdapter,
  type MetadataFn,
} from "@healthzkit/shared";

interface BaseMemjsOptions {
  /** Key to read. A cache miss is healthy. Defaults to "healthzkit:healthcheck". */
  key?: string;
  metadata?: MetadataFn<Client>;
}

export interface MemjsAdapterOptionsWithClient extends BaseMemjsOptions {
  client: Client;
  servers?: never;
  options?: never;
}

export interface MemjsAdapterOptionsWithServers extends BaseMemjsOptions {
  /** Comma-separated servers in memjs format, optionally including credentials. */
  servers: string;
  options?: ClientOptions & ServerOptions;
  client?: never;
}

export type MemjsAdapterOptions = MemjsAdapterOptionsWithClient | MemjsAdapterOptionsWithServers;

/** Read a key from the server selected by memjs without writing to the cache. */
export function memjsAdapter(options: MemjsAdapterOptions): HealthAdapter {
  let clientPromise: Promise<Client> | undefined;

  async function getClient(): Promise<Client> {
    if (options.client !== undefined) return options.client;
    if (!options.servers?.trim() || options.servers.split(",").some((server) => !server.trim())) {
      throw new Error("memjsAdapter: provide non-empty servers or a client");
    }

    clientPromise ??= import("memjs")
      .then(({ Client: MemjsClient }) =>
        MemjsClient.create(options.servers, { retries: 1, ...options.options }),
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
        const key = options.key ?? "healthzkit:healthcheck";
        if (!key || /\s/.test(key) || key.includes("\0") || Buffer.byteLength(key) > 250) {
          throw new Error("memjsAdapter: key must be 1–250 bytes without whitespace or NUL");
        }
        const client = await getClient();
        const start = Date.now();
        await client.get(key);
        const latencyMs = Date.now() - start;
        return buildResult(latencyMs, await options.metadata?.(client));
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
