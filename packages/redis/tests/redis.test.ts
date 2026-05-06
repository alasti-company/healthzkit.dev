import { describe, expect, test, vi } from "vite-plus/test";
import type { RedisClientType, RespVersions } from "redis";
import { nodeRedisAdapter } from "../src/redis.ts";

type NodeRedisClient = Pick<
  RedisClientType<never, never, never, RespVersions>,
  "sendCommand" | "isOpen" | "connect"
>;

describe("src/redis.ts (node-redis)", () => {
  test("sendCommand with default PING when client is already open", async () => {
    const sendCommand = vi.fn().mockResolvedValue("PONG");
    const connect = vi.fn();
    const client = {
      sendCommand,
      isOpen: true,
      connect,
    } as unknown as NodeRedisClient;
    const adapter = nodeRedisAdapter({ client });
    const result = await adapter.check();
    expect(result.status).toBe("ok");
    expect(connect).not.toHaveBeenCalled();
    expect(sendCommand).toHaveBeenCalledWith(["PING"]);
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("connects when client reports closed", async () => {
    const sendCommand = vi.fn().mockResolvedValue(undefined);
    const connect = vi.fn().mockResolvedValue(undefined);
    const client = {
      sendCommand,
      isOpen: false,
      connect,
    } as unknown as NodeRedisClient;
    const adapter = nodeRedisAdapter({ client });
    await adapter.check();
    expect(connect).toHaveBeenCalledOnce();
    expect(sendCommand).toHaveBeenCalledOnce();
  });

  test("uses custom command split into argv", async () => {
    const sendCommand = vi.fn().mockResolvedValue(undefined);
    const client = {
      sendCommand,
      isOpen: true,
      connect: vi.fn(),
    } as unknown as NodeRedisClient;
    const adapter = nodeRedisAdapter({ client, command: "ECHO hello" });
    await adapter.check();
    expect(sendCommand).toHaveBeenCalledWith(["ECHO", "hello"]);
  });

  test("returns fail when sendCommand rejects", async () => {
    const sendCommand = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const client = {
      sendCommand,
      isOpen: true,
      connect: vi.fn(),
    } as unknown as NodeRedisClient;
    const adapter = nodeRedisAdapter({ client });
    const result = await adapter.check();
    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("ECONNREFUSED");
  });

  test("includes metadata from optional metadata hook", async () => {
    const sendCommand = vi.fn().mockResolvedValue(undefined);
    const client = {
      sendCommand,
      isOpen: true,
      connect: vi.fn(),
    } as unknown as NodeRedisClient;
    const adapter = nodeRedisAdapter({
      client,
      metadata: async (c) => {
        expect(c).toBe(client);
        return { db: 0 };
      },
    });
    const result = await adapter.check();
    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({ db: 0, latencyMs: expect.any(Number) });
  });
});
