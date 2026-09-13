import { describe, expect, test } from "vite-plus/test";
import { createHealthKit, HealthKit } from "../src/index.ts";

describe("package entry (src/index.ts)", () => {
  test("re-exports createHealthKit, HealthKit, and Fetch helpers", async () => {
    const fromEntry = await import("../src/index.ts");
    const fromHealthkit = await import("../src/healthkit.ts");
    const fromHttp = await import("../src/http.ts");
    expect(fromEntry.createHealthKit).toBe(fromHealthkit.createHealthKit);
    expect(fromEntry.HealthKit).toBe(fromHealthkit.HealthKit);
    expect(fromEntry.toFetchResponse).toBe(fromHttp.toFetchResponse);
    expect(fromEntry.createFetchHandler).toBe(fromHttp.createFetchHandler);
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
