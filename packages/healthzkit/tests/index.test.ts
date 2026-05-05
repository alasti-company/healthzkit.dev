import { describe, expect, test } from "vite-plus/test";
import { createHealthKit, HealthKit } from "../src/index.ts";

describe("package entry (src/index.ts)", () => {
  test("re-exports createHealthKit and HealthKit from healthkit", async () => {
    const fromEntry = await import("../src/index.ts");
    const fromHealthkit = await import("../src/healthkit.ts");
    expect(fromEntry.createHealthKit).toBe(fromHealthkit.createHealthKit);
    expect(fromEntry.HealthKit).toBe(fromHealthkit.HealthKit);
  });

  test("createHealthKit from entry builds a working kit", async () => {
    const kit = createHealthKit({
      checks: [
        { name: "x", type: ["liveness"], adapter: { check: async () => ({ status: "ok" }) } },
      ],
    });
    expect(kit).toBeInstanceOf(HealthKit);
    const res = await kit.handleLiveness();
    expect(res.status).toBe(200);
  });
});
