import { describe, expect, test } from "vite-plus/test";
import { mongodbAdapter, mongooseAdapter } from "../src/index.ts";

describe("package entry (src/index.ts)", () => {
  test("re-exports mongodbAdapter and mongooseAdapter", async () => {
    const entry = await import("../src/index.ts");
    const mongodbMod = await import("../src/mongodb.ts");
    const mongooseMod = await import("../src/mongoose.ts");
    expect(entry.mongodbAdapter).toBe(mongodbMod.mongodbAdapter);
    expect(entry.mongooseAdapter).toBe(mongooseMod.mongooseAdapter);
  });

  test("adapters are usable from the barrel", async () => {
    const mongo = mongodbAdapter({
      client: {
        connect: async () => undefined,
        db: () => ({ command: async () => ({ ok: 1 }) }),
      } as never,
    });
    expect((await mongo.check()).status).toBe("ok");

    const mongoose = mongooseAdapter({
      connection: {
        readyState: 1,
        db: { admin: () => ({ command: async () => ({ ok: 1 }) }) },
      } as never,
    });
    expect((await mongoose.check()).status).toBe("ok");
  });
});
