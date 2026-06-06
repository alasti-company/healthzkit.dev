import type { MetadataFn } from "@healthzkit/shared";

export const DEFAULT_COMMAND = "PING";

export interface BaseValkeyOptions<TClient> {
  /**
   * Command to run as the healthcheck.
   * @default "PING"
   */
  command?: string;
  /**
   * Optional function to populate metadata in the check result.
   * Receives the resolved client so you can run additional commands.
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
