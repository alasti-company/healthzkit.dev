import { describe, expect, test } from "vite-plus/test";
import { pgAdapter, postgresJsAdapter } from "../src/index.ts";

describe("package entry (src/index.ts)", () => {
  test("re-exports pgAdapter and postgresJsAdapter", async () => {
    const entry = await import("../src/index.ts");
    const pgMod = await import("../src/pg.ts");
    const postgresMod = await import("../src/postgres.ts");
    expect(entry.pgAdapter).toBe(pgMod.pgAdapter);
    expect(entry.postgresJsAdapter).toBe(postgresMod.postgresJsAdapter);
  });

  test("adapters are usable from the barrel", async () => {
    const adapter = pgAdapter({
      client: { query: async () => ({ rows: [] }) } as unknown as import("pg").ClientBase,
    });
    expect((await adapter.check()).status).toBe("ok");
    const unsafe = async () => undefined;
    const sqlAdapter = postgresJsAdapter({
      client: { unsafe } as unknown as import("postgres").Sql,
    });
    expect((await sqlAdapter.check()).status).toBe("ok");
  });
});
