import { describe, expectTypeOf, test } from "vite-plus/test";
import type {
  AdapterResult,
  AgnosticRequest,
  CheckConfig,
  CheckResult,
  CheckStatus,
  CheckType,
  HealthkitConfig,
  HealthResponse,
  OutputFormat,
} from "../src/types.ts";

describe("src/types.ts", () => {
  test("CheckStatus is the expected union", () => {
    expectTypeOf<CheckStatus>().toEqualTypeOf<"ok" | "degraded" | "fail">();
  });

  test("CheckType is the expected union", () => {
    expectTypeOf<CheckType>().toEqualTypeOf<"liveness" | "readiness">();
  });

  test("OutputFormat is the expected union", () => {
    expectTypeOf<OutputFormat>().toEqualTypeOf<"json" | "text">();
  });

  test("HealthkitConfig requires checks array", () => {
    expectTypeOf<HealthkitConfig>().toMatchTypeOf<{ checks: CheckConfig[] }>();
  });

  test("CheckResult matches runtime shape used by formatters", () => {
    expectTypeOf<CheckResult>().toMatchTypeOf<{
      status: CheckStatus;
      latency: number;
      error?: string;
      metadata?: Record<string, unknown>;
      cachedAt?: string;
    }>();
  });

  test("HealthResponse matches rollup and formatter inputs", () => {
    expectTypeOf<HealthResponse>().toMatchTypeOf<{
      status: CheckStatus;
      timestamp: string;
      checks: Record<string, CheckResult>;
    }>();
  });

  test("AdapterResult allows optional error and metadata", () => {
    expectTypeOf<AdapterResult>().toMatchTypeOf<{
      status: CheckStatus;
      error?: Error | string;
      metadata?: Record<string, unknown>;
    }>();
  });

  test("AgnosticRequest path is required", () => {
    expectTypeOf<AgnosticRequest>().toMatchTypeOf<{ path: string; method?: string }>();
  });
});
