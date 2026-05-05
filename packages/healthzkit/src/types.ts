export type CheckStatus = "ok" | "degraded" | "fail";
export type CheckType = "liveness" | "readiness";
export type OutputFormat = "json" | "text";

export interface AdapterResult {
  status: CheckStatus;
  error?: Error | string;
  metadata?: Record<string, unknown>;
}

export interface HealthAdapter {
  check(): Promise<AdapterResult>;
}

export interface CheckConfig {
  name: string;
  type: CheckType[];
  adapter: HealthAdapter;
  timeout?: number; // in ms, default 5_000
  schedule?: {
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
}

export interface DefaultsConfig {
  onFail?: {
    httpStatus?: number;
  };
  onDegraded?: {
    httpStatus?: number;
  };
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
