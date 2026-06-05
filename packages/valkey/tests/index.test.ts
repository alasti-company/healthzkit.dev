import { describe, expect, test } from "vite-plus/test";
import type { GlideClient } from "@valkey/valkey-glide";
import { glideValkeyAdapter, iovalkeyAdapter } from "../src/index.ts";

type GlideValkeyClient = Pick<GlideClient, "customCommand">;

describe("package entry (src/index.ts)", () => {
  test("re-exports adapters from implementation modules", async () => {
    const entry = await import("../src/index.ts");
    const io = await import("../src/iovalkey.ts");
    const glide = await import("../src/valkey-glide.ts");

    expect(entry.iovalkeyAdapter).toBe(io.iovalkeyAdapter);
    expect(entry.glideValkeyAdapter).toBe(glide.glideValkeyAdapter);
  });

  test("each adapter can be constructed from the barrel with mocks", async () => {
    const io = iovalkeyAdapter({
      client: { call: async () => "PONG" } as unknown as import("iovalkey").Redis,
    });
    expect((await io.check()).status).toBe("ok");

    const glide = glideValkeyAdapter({
      client: {
        customCommand: async () => "PONG",
      } as unknown as GlideValkeyClient,
    });
    expect((await glide.check()).status).toBe("ok");
  });
});
