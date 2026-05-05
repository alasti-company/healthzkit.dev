import { describe, expect, test } from "vite-plus/test";
import { computeRollupStatus } from "../src/rollup.ts";
import type { CheckResult } from "../src/types.ts";

function r(status: CheckResult["status"]): CheckResult {
  return { status, latency: 0 };
}

describe("src/rollup.ts", () => {
  test("empty results roll up to ok", () => {
    expect(computeRollupStatus({})).toBe("ok");
  });

  test("all ok stays ok", () => {
    expect(computeRollupStatus({ a: r("ok"), b: r("ok") })).toBe("ok");
  });

  test("any degraded yields degraded when no fail", () => {
    expect(computeRollupStatus({ a: r("ok"), b: r("degraded") })).toBe("degraded");
  });

  test("fail wins over degraded", () => {
    expect(computeRollupStatus({ a: r("degraded"), b: r("fail") })).toBe("fail");
  });

  test("custom computeStatus replaces default", () => {
    expect(computeRollupStatus({ a: r("fail") }, { computeStatus: () => "ok" })).toBe("ok");
  });
});
