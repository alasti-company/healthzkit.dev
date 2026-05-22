import type { BasePrismaOptions } from "./shared.ts";
import type { HealthAdapter, AdapterResult } from "./shared.ts";
import { buildResult, buildErrorResult } from "./shared.ts";

const DEFAULT_QUERY = "SELECT 1";

export interface PrismaClientLike {
  $queryRawUnsafe: (query: string) => Promise<unknown>;
  $connect: () => Promise<void>;
}

export interface PrismaAdapterOptionsWithClient extends BasePrismaOptions<PrismaClientLike> {
  client: PrismaClientLike;
}

export type PrismaAdapterOptions = PrismaAdapterOptionsWithClient;

export function prismaAdapter(options: PrismaAdapterOptions): HealthAdapter {
  async function getClient(): Promise<PrismaClientLike> {
    return options.client;
  }

  return {
    async check(): Promise<AdapterResult> {
      try {
        const client = await getClient();
        const start = Date.now();

        await client.$connect();
        await client.$queryRawUnsafe(options.query ?? DEFAULT_QUERY);

        const latencyMs = Date.now() - start;
        const metadataResult = options.metadata ? options.metadata(client) : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;

        return buildResult(latencyMs, metadata);
      } catch (error) {
        return buildErrorResult(error);
      }
    },
  };
}
