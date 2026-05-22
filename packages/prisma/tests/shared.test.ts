import { describe, expect, test } from "vite-plus/test";
import { buildErrorResult, buildResult } from "../src/shared.ts";

describe("src/shared.ts", () => {
  test("buildResult marks ok and includes latencyMs in metadata", () => {
    const r = buildResult(42);
    expect(r.status).toBe("ok");
    expect(r.metadata).toEqual({ latencyMs: 42 });
  });

  test("buildResult merges extra metadata", () => {
    const r = buildResult(1, { version: "7" });
    expect(r.metadata).toEqual({ latencyMs: 1, version: "7" });
  });

  test("buildResult always uses measured latencyMs over metadata", () => {
    const r = buildResult(10, { latencyMs: 999 });
    expect(r.metadata).toEqual({ latencyMs: 10 });
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
