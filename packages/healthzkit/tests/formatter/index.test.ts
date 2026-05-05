import { describe, expect, test } from "vite-plus/test";
import { format } from "../../src/formatter/index.ts";
import type { HealthResponse } from "../../src/types.ts";

const sample: HealthResponse = {
  status: "ok",
  timestamp: "t",
  checks: { ping: { status: "ok", latency: 0 } },
};

describe("src/formatter/index.ts", () => {
  test("defaults to JSON", () => {
    const { body, contentType } = format(sample);
    expect(contentType).toBe("application/json");
    expect(body).toBe(JSON.stringify(sample));
  });

  test("format json is explicit", () => {
    const { body, contentType } = format(sample, "json");
    expect(contentType).toBe("application/json");
    expect(JSON.parse(body).status).toBe("ok");
  });

  test("format text delegates to text formatter", () => {
    const { body, contentType } = format(sample, "text");
    expect(contentType).toBe("text/plain");
    expect(body).toContain("status: ok");
    expect(body).toContain("ping: ok");
  });
});
