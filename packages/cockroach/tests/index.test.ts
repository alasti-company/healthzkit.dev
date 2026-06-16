import { describe, expect, test } from "vite-plus/test";
import { cockroachPgAdapter } from "../src/index.ts";

describe("package entry (src/index.ts)", () => {
  test("re-exports cockroachPgAdapter", async () => {
    const entry = await import("../src/index.ts");
    const pgMod = await import("../src/pg.ts");
    expect(entry.cockroachPgAdapter).toBe(pgMod.cockroachPgAdapter);
  });

  test("adapter is usable from the barrel", async () => {
    const adapter = cockroachPgAdapter({
      client: { query: async () => ({ rows: [] }) } as unknown as import("pg").ClientBase,
    });
    expect((await adapter.check()).status).toBe("ok");
  });
});
