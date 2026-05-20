import { describe, expect, test } from "vite-plus/test";
import { dynamoV2Adapter, dynamoV3Adapter } from "../src/index.ts";

describe("package entry (src/index.ts)", () => {
  test("re-exports both dynamo adapters", async () => {
    const entry = await import("../src/index.ts");
    const v2Mod = await import("../src/v2.ts");
    const v3Mod = await import("../src/v3.ts");

    expect(entry.dynamoV2Adapter).toBe(v2Mod.dynamoV2Adapter);
    expect(entry.dynamoV3Adapter).toBe(v3Mod.dynamoV3Adapter);
  });

  test("adapters are usable from the barrel", async () => {
    const v2 = dynamoV2Adapter({
      client: {
        listTables: (_params: { Limit?: number }, cb: (error: Error | null) => void) => cb(null),
      } as never,
    });
    expect((await v2.check()).status).toBe("ok");

    const v3 = dynamoV3Adapter({
      client: {
        send: async () => ({}),
      } as never,
    });
    expect((await v3.check()).status).toBe("ok");
  });
});
