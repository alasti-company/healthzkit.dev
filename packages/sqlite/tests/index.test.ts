import { describe, expect, test } from "vite-plus/test";
import { betterSqlite3Adapter, libsqlAdapter, sqlite3Adapter } from "../src/index.ts";

describe("package entry (src/index.ts)", () => {
  test("re-exports all sqlite adapters", async () => {
    const entry = await import("../src/index.ts");
    const betterSqlite3Mod = await import("../src/better-sqlite3.ts");
    const libsqlMod = await import("../src/libsql.ts");
    const sqlite3Mod = await import("../src/sqlite3.ts");

    expect(entry.betterSqlite3Adapter).toBe(betterSqlite3Mod.betterSqlite3Adapter);
    expect(entry.libsqlAdapter).toBe(libsqlMod.libsqlAdapter);
    expect(entry.sqlite3Adapter).toBe(sqlite3Mod.sqlite3Adapter);
  });

  test("adapters are usable from the barrel", async () => {
    const betterSqlite3 = betterSqlite3Adapter({
      client: {
        prepare: () => ({ get: () => ({ ok: 1 }) }),
      } as never,
    });
    expect((await betterSqlite3.check()).status).toBe("ok");

    const sqlite3 = sqlite3Adapter({
      client: {
        get: (_sql: string, cb: (err: null) => void) => cb(null),
      } as never,
    });
    expect((await sqlite3.check()).status).toBe("ok");

    const libsql = libsqlAdapter({
      client: {
        execute: async () => ({ rows: [] }),
      } as never,
    });
    expect((await libsql.check()).status).toBe("ok");
  });
});
