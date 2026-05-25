import { describe, expect, test } from "vite-plus/test";
import { buildErrorResult, buildResult } from "../src/shared.ts";

describe("src/shared.ts", () => {
  test("buildResult marks ok and includes latencyMs in metadata", () => {
    const r = buildResult(12);
    expect(r.status).toBe("ok");
    expect(r.metadata).toEqual({ latencyMs: 12 });
  });

  test("buildResult merges extra metadata after latencyMs", () => {
    const r = buildResult(3, { statusCode: 200 });
    expect(r.metadata).toEqual({ latencyMs: 3, statusCode: 200 });
  });

  test("buildErrorResult wraps Error instances", () => {
    const r = buildErrorResult(new Error("connection refused"));
    expect(r.status).toBe("fail");
    expect(r.error).toBeInstanceOf(Error);
    expect((r.error as Error).message).toBe("connection refused");
  });

  test("buildErrorResult coerces non-Error values", () => {
    const r = buildErrorResult("timeout");
    expect(r.status).toBe("fail");
    expect(r.error).toBeInstanceOf(Error);
    expect((r.error as Error).message).toBe("timeout");
  });
});
