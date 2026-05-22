import { describe, expect, test } from "vite-plus/test";
import { prismaAdapter } from "../src/index.ts";

describe("package entry (src/index.ts)", () => {
  test("re-exports prismaAdapter", async () => {
    const entry = await import("../src/index.ts");
    const prismaMod = await import("../src/prisma.ts");

    expect(entry.prismaAdapter).toBe(prismaMod.prismaAdapter);
  });

  test("adapter is usable from the barrel", async () => {
    const client = {
      $connect: async () => undefined,
      $queryRawUnsafe: async () => [],
    };
    const adapter = prismaAdapter({ client: client as never });
    expect((await adapter.check()).status).toBe("ok");
  });
});
