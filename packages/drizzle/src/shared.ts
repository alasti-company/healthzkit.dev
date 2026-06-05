import type { MetadataFn } from "@healthzkit/shared";

export interface BaseDrizzleOptions<TClient> {
  /**
   * Optional function to populate metadata in the check result.
   * Receives the resolved underlying client.
   */
  metadata?: MetadataFn<TClient>;
}

export {
  buildResult,
  buildErrorResult,
  type MetadataFn,
  type HealthAdapter,
  type AdapterResult,
} from "@healthzkit/shared";
