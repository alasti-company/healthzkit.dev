import { describe, expect, test } from "vite-plus/test";
import { formatJson } from "../../src/formatter/json.ts";
import type { HealthResponse } from "../../src/types.ts";

describe("src/formatter/json.ts", () => {
  test("stringifies HealthResponse", () => {
    const response: HealthResponse = {
      status: "ok",
      timestamp: "t0",
      checks: { db: { status: "ok", latency: 1 } },
    };
    expect(formatJson(response)).toBe(JSON.stringify(response));
  });
});
