export type CheckStatus = "ok" | "degraded" | "fail";
export type CheckType = "liveness" | "readiness" | "startup";
export type OutputFormat = "json" | "text";

export interface AdapterResult {
  status: CheckStatus;
  error?: Error | string;
  metadata?: Record<string, unknown>;
}

export interface CheckContext {
  /** Aborted when the check deadline expires. Cancellation is cooperative. */
  signal: AbortSignal;
}

export interface HealthAdapter {
  check(context?: CheckContext): Promise<AdapterResult>;
}

export interface CheckConfig {
  /** Must be unique across all checks in the HealthKit configuration. */
  name: string;
  type: CheckType[];
  adapter: HealthAdapter;
  /** Integer milliseconds, 1–2_147_483_647. Defaults to defaults.timeout, then 5_000. */
  timeout?: number;
  schedule?: {
    /** Integer milliseconds, 1–2_147_483_647. */
    intervalMs: number;
  };
  onFail?: {
    httpStatus?: number; // default 503
    treatAs?: CheckStatus; // override reported status
  };
  onDegraded?: {
    httpStatus?: number; // default 200
  };
}

export interface CheckResult {
  status: CheckStatus;
  latency: number;
  error?: string;
  metadata?: Record<string, unknown>;
  cachedAt?: string; // ISO string (present if result is from cache)
}

export interface HealthResponse {
  status: CheckStatus;
  timestamp: string;
  checks: Record<string, CheckResult>;
}

export interface RollupConfig {
  /**
   * Custom function to determine top-level status from all check results.
   * Defaults to:
   * * any fail -> fail
   * * any degraded -> degraded
   * * else ok
   */
  computeStatus?: (results: Record<string, CheckResult>) => CheckStatus;
}

export interface OutputConfig {
  format?: OutputFormat;
  /**
   * Expose error messages in the response.
   * Default: true
   */
  exposeError?: boolean;
  /**
   * Include all metadata (default: true), omit it (false), or allowlist scalar
   * leaves by JSON Pointer, e.g. ["/region", "/service/version"].
   * Allowlists exclude objects, arrays, accessors, and non-JSON values.
   */
  exposeMetadata?: boolean | readonly string[];
  /** Full diagnostics (default) or only the overall status, without check names. */
  detail?: "full" | "status";
}

export interface DefaultsConfig {
  onFail?: {
    httpStatus?: number;
  };
  onDegraded?: {
    httpStatus?: number;
  };
  /** Integer milliseconds, 1–2_147_483_647. Default: 5_000. */
  timeout?: number;
}

export interface HealthkitConfig {
  checks: CheckConfig[];
  basePath?: string; // default: "/healthz"
  rollup?: RollupConfig;
  output?: OutputConfig;
  defaults?: DefaultsConfig;
}

export interface AgnosticRequest {
  path: string;
  method?: string;
}

export interface AgnosticResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
