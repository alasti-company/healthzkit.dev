import { describe, expect, test } from "vite-plus/test";
import { DEFAULT_COMMAND, buildErrorResult, buildResult } from "../src/shared.ts";

describe("src/shared.ts", () => {
  test("DEFAULT_COMMAND is PING", () => {
    expect(DEFAULT_COMMAND).toBe("PING");
  });

  test("buildResult marks ok and includes latencyMs in metadata", () => {
    const r = buildResult(7);
    expect(r.status).toBe("ok");
    expect(r.metadata).toEqual({ latencyMs: 7 });
  });

  test("buildResult merges extra metadata after latencyMs", () => {
    const r = buildResult(2, { mode: "cluster" });
    expect(r.metadata).toEqual({ latencyMs: 2, mode: "cluster" });
  });

  test("buildErrorResult wraps Error instances", () => {
    const r = buildErrorResult(new Error("NOAUTH"));
    expect(r.status).toBe("fail");
    expect((r.error as Error).message).toBe("NOAUTH");
  });

  test("buildErrorResult coerces non-Error values", () => {
    const r = buildErrorResult("broken");
    expect(r.status).toBe("fail");
    expect((r.error as Error).message).toBe("broken");
  });
});
