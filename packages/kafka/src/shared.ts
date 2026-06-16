import type { MetadataFn } from "@healthzkit/shared";

export interface BaseKafkaOptions<TClient> {
  /**
   * Optional function to populate metadata in the check result.
   * Receives the resolved client so you can additional operations.
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
