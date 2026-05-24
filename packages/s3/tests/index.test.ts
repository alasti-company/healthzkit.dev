import { describe, expect, test } from "vite-plus/test";
import { s3V2Adapter, s3V3Adapter } from "../src/index.ts";

describe("package entry (src/index.ts)", () => {
  test("re-exports both s3 adapters", async () => {
    const entry = await import("../src/index.ts");
    const v2Mod = await import("../src/v2.ts");
    const v3Mod = await import("../src/v3.ts");

    expect(entry.s3V2Adapter).toBe(v2Mod.s3V2Adapter);
    expect(entry.s3V3Adapter).toBe(v3Mod.s3V3Adapter);
  });

  test("adapters are usable from the barrel", async () => {
    const v2 = s3V2Adapter({
      client: {
        listBuckets: (cb: (error: Error | null, data?: { Buckets?: unknown[] }) => void) =>
          cb(null, { Buckets: [] }),
      } as never,
    });
    expect((await v2.check()).status).toBe("ok");

    const v3 = s3V3Adapter({
      client: {
        send: async () => ({ Buckets: [] }),
      } as never,
    });
    expect((await v3.check()).status).toBe("ok");
  });
});
