import type { AdapterResult, HealthAdapter } from "healthzkit";

export type MetadataFn<TClient> = (
  client: TClient,
) => Promise<Record<string, unknown>> | Record<string, unknown>;

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

export type { AdapterResult, HealthAdapter };
