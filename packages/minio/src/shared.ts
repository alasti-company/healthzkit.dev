import type { MetadataFn } from "@healthzkit/shared";

export interface BaseMinioOptions<TClient> {
  /**
   * Optional function to populate metadata in the check result.
   * Receives the resolved client so you can run additional operations.
   */
  metadata?: MetadataFn<TClient>;
}

export {
  buildResult,
  buildErrorResult,
  type AdapterResult,
  type HealthAdapter,
  type MetadataFn,
} from "@healthzkit/shared";
