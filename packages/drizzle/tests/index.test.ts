import { describe, expect, test } from "vite-plus/test";
import { drizzleAdapter } from "../src/index.ts";

describe("package entry (src/index.ts)", () => {
  test("re-exports drizzleAdapter, extractClient, and detectDriver", async () => {
    const entry = await import("../src/index.ts");
    const drizzleMod = await import("../src/drizzle.ts");
    const extractMod = await import("../src/extract.ts");

    expect(entry.drizzleAdapter).toBe(drizzleMod.drizzleAdapter);
    expect(entry.extractClient).toBe(extractMod.extractClient);
    expect(entry.detectDriver).toBe(extractMod.detectDriver);
  });

  test("adapter is usable from the barrel", async () => {
    const db = {
      execute: async () => ({}),
      session: { client: { query: async () => ({}) }, query: {} },
    };
    const adapter = drizzleAdapter({ db: db as never });
    expect((await adapter.check()).status).toBe("ok");
  });
});
