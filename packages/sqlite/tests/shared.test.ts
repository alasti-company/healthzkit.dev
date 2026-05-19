import { describe, expect, test } from "vite-plus/test";
import { DEFAULT_QUERY, buildErrorResult, buildResult } from "../src/shared.ts";

describe("src/shared.ts", () => {
  test("DEFAULT_QUERY is SELECT 1", () => {
    expect(DEFAULT_QUERY).toBe("SELECT 1");
  });

  test("buildResult marks ok and includes latencyMs in metadata", () => {
    const r = buildResult(42);
    expect(r.status).toBe("ok");
    expect(r.metadata).toEqual({ latencyMs: 42 });
  });

  test("buildResult merges extra metadata", () => {
    const r = buildResult(1, { journal_mode: "wal" });
    expect(r.metadata).toEqual({ latencyMs: 1, journal_mode: "wal" });
  });

  test("buildResult always uses measured latencyMs over metadata", () => {
    const r = buildResult(10, { latencyMs: 999 });
    expect(r.metadata).toEqual({ latencyMs: 10 });
  });

  test("buildErrorResult wraps Error instances", () => {
    const r = buildErrorResult(new Error("database locked"));
    expect(r.status).toBe("fail");
    expect(r.error).toBeInstanceOf(Error);
    expect((r.error as Error).message).toBe("database locked");
  });

  test("buildErrorResult coerces non-Error values", () => {
    const r = buildErrorResult("disk I/O error");
    expect(r.status).toBe("fail");
    expect(r.error).toBeInstanceOf(Error);
    expect((r.error as Error).message).toBe("disk I/O error");
  });
});
