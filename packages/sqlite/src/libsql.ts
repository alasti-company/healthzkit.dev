import type { Client } from "@libsql/client";
import type { BaseSqliteOptions, MetadataFn } from "./shared.ts";
import type { HealthAdapter, AdapterResult } from "./shared.ts";
import { DEFAULT_QUERY, buildResult, buildErrorResult } from "./shared.ts";

export interface LibsqlAdapterOptionsWithClient extends BaseSqliteOptions<Client> {
  client: Client;
  url?: never;
  authToken?: never;
}

export interface LibsqlAdapterOptionsWithConnectionString extends BaseSqliteOptions<Client> {
  url: string;
  authToken?: string;
  client?: never;
}

export type LibsqlAdapterOptions =
  | LibsqlAdapterOptionsWithClient
  | LibsqlAdapterOptionsWithConnectionString;

export function libsqlAdapter(options: LibsqlAdapterOptions): HealthAdapter {
  let internalClient: Client | null = null;
  let internalClientInit: Promise<Client> | null = null;

  async function getClient(): Promise<Client> {
    if ("url" in options && options.url) {
      if (internalClient) {
        return internalClient;
      }

      if (!internalClientInit) {
        internalClientInit = (async () => {
          try {
            const { createClient } = await import("@libsql/client");
            const client = createClient({
              url: options.url,
              authToken: options.authToken,
            });
            internalClient = client;
            return client;
          } finally {
            internalClientInit = null;
          }
        })();
      }

      return internalClientInit;
    }

    if ("client" in options && options.client !== undefined) {
      return options.client;
    }

    throw new Error("libsqlAdapter: provide a non-empty url or a client");
  }

  return {
    async check(): Promise<AdapterResult> {
      try {
        const client = await getClient();
        const start = Date.now();

        await client.execute(options.query ?? DEFAULT_QUERY);
        const latencyMs = Date.now() - start;

        const metadataResult = options.metadata
          ? (options.metadata as MetadataFn<Client>)(client)
          : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;

        return buildResult(latencyMs, metadata);
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
