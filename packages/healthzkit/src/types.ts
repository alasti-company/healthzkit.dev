export type CheckStatus = "ok" | "degraded" | "fail";
export type CheckType = "liveness" | "readiness";
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

/** One event per underlying execution, never per cache read or waiting caller. */
export interface CheckCompleteEvent {
  name: string;
  type: CheckType[];
  source: "scheduled" | "on-demand";
  status: CheckStatus;
  /** Execution duration in milliseconds, including the deadline on timeout. */
  duration: number;
  /** ISO timestamp at completion (or timeout). */
  timestamp: string;
  /** Internal diagnostics, independent of public output filtering. Non-cloneable metadata is omitted. */
  result: CheckResult;
}

export interface StatusChangeEvent extends CheckCompleteEvent {
  previousStatus: CheckStatus;
}

export interface ObservabilityHooks {
  onCheckComplete?: (event: CheckCompleteEvent) => unknown;
  /** Per-check effective status changes; the initial observation is not a change. */
  onStatusChange?: (event: StatusChangeEvent) => unknown;
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
   * Expose error messages in the HTTP response. Structured results and hooks retain them.
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
  /** Integer milliseconds, 1–2_147_483_647. Default: 5_000. */
  timeout?: number;
}

export interface HealthkitConfig {
  checks: CheckConfig[];
  /** Fire-and-forget callbacks; thrown errors and rejected promises are ignored. */
  hooks?: ObservabilityHooks;
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
