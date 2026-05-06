import { describe, expect, test } from "vite-plus/test";
import type { RedisClientType, RespVersions } from "redis";
import { ioredisAdapter, nodeRedisAdapter, upstashAdapter } from "../src/index.ts";

type NodeRedisClient = Pick<
  RedisClientType<never, never, never, RespVersions>,
  "sendCommand" | "isOpen" | "connect"
>;

describe("package entry (src/index.ts)", () => {
  test("re-exports adapters from implementation modules", async () => {
    const entry = await import("../src/index.ts");
    const io = await import("../src/ioredis.ts");
    const node = await import("../src/redis.ts");
    const up = await import("../src/upstash.ts");
    expect(entry.ioredisAdapter).toBe(io.ioredisAdapter);
    expect(entry.nodeRedisAdapter).toBe(node.nodeRedisAdapter);
    expect(entry.upstashAdapter).toBe(up.upstashAdapter);
  });

  test("each adapter can be constructed from the barrel with mocks", async () => {
    const io = ioredisAdapter({
      client: { call: async () => "PONG" } as unknown as import("ioredis").Redis,
    });
    expect((await io.check()).status).toBe("ok");

    const node = nodeRedisAdapter({
      client: {
        sendCommand: async () => undefined,
        isOpen: true,
        connect: async () => undefined,
      } as unknown as NodeRedisClient,
    });
    expect((await node.check()).status).toBe("ok");

    const up = upstashAdapter({
      client: {
        ping: async () => "PONG",
        exec: async () => null,
      } as unknown as import("@upstash/redis").Redis,
    });
    expect((await up.check()).status).toBe("ok");
  });
});
