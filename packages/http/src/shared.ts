export type MetadataFn = (
  response: Response,
) => Promise<Record<string, unknown>> | Record<string, unknown>;

export interface BaseHttpOptions {
  /**
   * Optional function to populate metadata from the response.
   */
  metadata?: MetadataFn;
}

export {
  buildResult,
  buildErrorResult,
  type AdapterResult,
  type HealthAdapter,
} from "@healthzkit/shared";
