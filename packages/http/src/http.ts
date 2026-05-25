import type { BaseHttpOptions } from "./shared.ts";
import type { HealthAdapter, AdapterResult } from "./shared.ts";
import { buildResult, buildErrorResult } from "./shared.ts";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "HEAD" | "OPTIONS" | "PATCH";

export interface HttpAdapterOptions extends BaseHttpOptions {
  /**
   * URL to send health check request to.
   */
  url: string | URL;
  /**
   * HTTP method to use
   * @default "GET"
   */
  method?: HttpMethod;
  /**
   * Request headers to include.
   */
  headers?: Record<string, string>;
  /**
   * Request body for POST/PUT/PATCH.
   */
  body?: string | Uint8Array;
  /**
   * Expected status codes indicating success.
   * @default [200, 204]
   */
  expectedStatusCodes?: number[];
  /**
   * Request timeout in milliseconds.
   * @default 5000
   */
  timeout?: number;
  /**
   * Follow redirects.
   * @default true
   */
  followRedirects?: boolean;
}

export function httpAdapter(options: HttpAdapterOptions): HealthAdapter {
  const expectedStatusCodes = options.expectedStatusCodes ?? [200, 204];
  const timeout = options.timeout ?? 5000;

  return {
    async check(): Promise<AdapterResult> {
      const abortController = new AbortController();
      const timer = setTimeout(() => abortController.abort(), timeout);

      try {
        const start = Date.now();

        const response = await fetch(options.url, {
          method: options.method ?? "GET",
          headers: options.headers,
          body: options.body,
          signal: abortController.signal,
          redirect: options.followRedirects === false ? "manual" : "follow",
        });

        const latencyMs = Date.now() - start;

        if (!expectedStatusCodes.includes(response.status)) {
          throw new Error(`Unexpected status code: ${response.status} ${response.statusText}`);
        }

        const metadataResult = options.metadata ? options.metadata(response) : undefined;
        const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;

        return buildResult(latencyMs, {
          ...metadata,
          statusCode: response.status,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return buildErrorResult(new Error(`Request timed out after ${timeout}ms`));
        }

        return buildErrorResult(error);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
