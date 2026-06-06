import type { MetadataFn } from "@healthzkit/shared";

export interface BaseMysqlOptions<TClient> {
  /**
   * Query to run as the health check.
   * @default "SELECT 1"
   */
  query?: string;
  /**
   * Optional function to populate metadata in the check result.
   * Receives the resolved client so you can run additional queries.
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
