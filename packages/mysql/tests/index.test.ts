import { describe, expect, test } from "vite-plus/test";
import { mysql2Adapter, mysqlAdapter } from "../src/index.ts";

describe("package entry (src/index.ts)", () => {
  test("re-exports mysqlAdapter and mysql2Adapter", async () => {
    const entry = await import("../src/index.ts");
    const mysqlMod = await import("../src/mysql.ts");
    const mysql2Mod = await import("../src/mysql2.ts");
    expect(entry.mysqlAdapter).toBe(mysqlMod.mysqlAdapter);
    expect(entry.mysql2Adapter).toBe(mysql2Mod.mysql2Adapter);
  });

  test("adapters are usable from the barrel", async () => {
    const mysql = mysqlAdapter({
      client: {
        query: (_sql: string, cb: (err: null, rows: unknown) => void) => cb(null, []),
      } as never,
    });
    expect((await mysql.check()).status).toBe("ok");

    const mysql2 = mysql2Adapter({
      client: {
        query: async () => [[]],
      } as never,
    });
    expect((await mysql2.check()).status).toBe("ok");
  });
});
