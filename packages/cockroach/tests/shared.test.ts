import { describe, expect, test } from "vite-plus/test";
import { buildErrorResult, buildResult, DEFAULT_QUERY } from "../src/shared.ts";

describe("src/shared.ts", () => {
  test("DEFAULT_QUERY is SELECT 1", () => {
    expect(DEFAULT_QUERY).toBe("SELECT 1");
  });

  test("buildResult marks ok and includes latencyMs in metadata", () => {
    const r = buildResult(42);
    expect(r.status).toBe("ok");
    expect(r.metadata).toEqual({ latencyMs: 42 });
  });

  test("buildResult merges extra metadata after latencyMs", () => {
    const r = buildResult(1, { version: "24.1", cluster: "main" });
    expect(r.metadata).toEqual({ latencyMs: 1, version: "24.1", cluster: "main" });
  });

  test("buildErrorResult wraps Error instances", () => {
    const r = buildErrorResult(new Error("db down"));
    expect(r.status).toBe("fail");
    expect(r.error).toBeInstanceOf(Error);
    expect((r.error as Error).message).toBe("db down");
  });

  test("buildErrorResult coerces non-Error values", () => {
    const r = buildErrorResult("timeout");
    expect(r.status).toBe("fail");
    expect(r.error).toBeInstanceOf(Error);
    expect((r.error as Error).message).toBe("timeout");
  });
});
