import type { GlideClient, GlideClientConfiguration } from "@valkey/valkey-glide";
import type { BaseValkeyOptions, MetadataFn } from "./shared.ts";
import type { HealthAdapter, AdapterResult } from "./shared.ts";
import { DEFAULT_COMMAND, buildResult, buildErrorResult } from "./shared.ts";

type GlideValkeyClient = Pick<GlideClient, "customCommand">;

function parseConnectionString(connectionString: string): GlideClientConfiguration {
  const url = new URL(connectionString);
  const protocol = url.protocol.replace(":", "");

  if (!["redis", "rediss", "valkey", "valkeys"].includes(protocol)) {
    throw new Error(
      `glideValkeyAdapter: invalid protocol in connectionString: ${protocol}. expected redis://, rediss://, valkey://, or valkeys://`,
    );
  }

  const useTLS = protocol === "rediss" || protocol === "valkeys";
  const port = url.port ? Number(url.port) : useTLS ? 6380 : 6379;
  const config: GlideClientConfiguration = {
    addresses: [{ host: url.hostname, port }],
    useTLS,
  };

  if (url.username || url.password) {
    config.credentials = {
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    };
  }

  const databaseId = Number(url.pathname.slice(1));
  if (!Number.isNaN(databaseId) && url.pathname.length > 1) {
    config.databaseId = databaseId;
  }

  return config;
}

export interface GlideValkeyAdapterOptionsWithClient extends BaseValkeyOptions<GlideValkeyClient> {
  client: GlideValkeyClient;
  connectionString?: never;
  options?: never;
}

export interface GlideValkeyAdapterOptionsWithConnectionString extends BaseValkeyOptions<GlideValkeyClient> {
  connectionString: string;
  options?: GlideClientConfiguration;
  client?: never;
}

export type GlideValkeyAdapterOptions =
  | GlideValkeyAdapterOptionsWithClient
  | GlideValkeyAdapterOptionsWithConnectionString;

export function glideValkeyAdapter(options: GlideValkeyAdapterOptions): HealthAdapter {
  let internalClient: GlideValkeyClient | null = null;

  async function getClient(): Promise<GlideValkeyClient> {
    if ("connectionString" in options && options.connectionString) {
      if (!internalClient) {
        const { GlideClient } = await import("@valkey/valkey-glide");
        internalClient = await GlideClient.createClient({
          ...parseConnectionString(options.connectionString),
          ...options.options,
        });
      }

      return internalClient;
    }

    if ("client" in options && options.client !== undefined) {
      return options.client;
    }

    throw new Error("glideValkeyAdapter: provide a non-empty connectionString or a client");
  }

  return {
    async check(): Promise<AdapterResult> {
      try {
        const client = await getClient();
        const start = Date.now();

        await client.customCommand((options.command ?? DEFAULT_COMMAND).split(" "));
        const latencyMs = Date.now() - start;

        const metadataResult = options.metadata
          ? (options.metadata as MetadataFn<GlideValkeyClient>)(client)
          : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;

        return buildResult(latencyMs, metadata);
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
