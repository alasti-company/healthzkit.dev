import { describe, expect, test } from "vite-plus/test";
import { formatText } from "../../src/formatter/text.ts";
import type { HealthResponse } from "../../src/types.ts";

describe("src/formatter/text.ts", () => {
  test("prints status line and one line per check", () => {
    const response: HealthResponse = {
      status: "degraded",
      timestamp: "ignored",
      checks: {
        a: { status: "ok", latency: 3 },
        b: { status: "fail", latency: 9, error: "x" },
      },
    };
    const text = formatText(response);
    expect(text).toBe("status: degraded\na: ok (3ms)\nb: fail (9ms) - x");
  });
});
