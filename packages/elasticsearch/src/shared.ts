import type { HealthAdapter, AdapterResult } from "healthzkit";

export type MetadataFn<TClient> = (
  client: TClient,
) => Promise<Record<string, unknown>> | Record<string, unknown>;

export interface BaseElasticsearchOptions<TClient> {
  /**
   * Optional function to populate metadata in the check result.
   * Receives the resolved client so you can run additional operations.
   */
  metadata?: MetadataFn<TClient>;
}

export function buildResult(latencyMs: number, metadata?: Record<string, unknown>): AdapterResult {
  return {
    status: "ok",
    metadata: {
      ...metadata,
      latencyMs,
    },
  };
}

export function buildErrorResult(error: unknown): AdapterResult {
  return {
    status: "fail",
    error: error instanceof Error ? error : new Error(String(error)),
  };
}

export type { HealthAdapter, AdapterResult };
