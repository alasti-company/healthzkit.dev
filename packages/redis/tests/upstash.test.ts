import { describe, expect, test, vi } from "vite-plus/test";
import type { Redis as UpstashRedis } from "@upstash/redis";
import { upstashAdapter } from "../src/upstash.ts";

describe("src/upstash.ts", () => {
  test("uses ping for default health command", async () => {
    const ping = vi.fn().mockResolvedValue("PONG");
    const exec = vi.fn();
    const client = { ping, exec } as unknown as UpstashRedis;
    const adapter = upstashAdapter({ client });
    const result = await adapter.check();
    expect(result.status).toBe("ok");
    expect(ping).toHaveBeenCalledOnce();
    expect(exec).not.toHaveBeenCalled();
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("uses exec for explicit non-default command", async () => {
    const ping = vi.fn();
    const exec = vi.fn().mockResolvedValue(null);
    const client = { ping, exec } as unknown as UpstashRedis;
    const adapter = upstashAdapter({ client, command: "GET mykey" });
    await adapter.check();
    expect(exec).toHaveBeenCalledWith(["GET", "mykey"]);
    expect(ping).not.toHaveBeenCalled();
  });

  test("still pings when command is exactly PING", async () => {
    const ping = vi.fn().mockResolvedValue("PONG");
    const exec = vi.fn();
    const client = { ping, exec } as unknown as UpstashRedis;
    await upstashAdapter({ client, command: "PING" }).check();
    expect(ping).toHaveBeenCalledOnce();
    expect(exec).not.toHaveBeenCalled();
  });

  test("returns fail when ping rejects", async () => {
    const ping = vi.fn().mockRejectedValue(new Error("unauthorized"));
    const client = { ping, exec: vi.fn() } as unknown as UpstashRedis;
    const result = await upstashAdapter({ client }).check();
    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("unauthorized");
  });

  test("includes metadata from optional metadata hook", async () => {
    const ping = vi.fn().mockResolvedValue("PONG");
    const client = { ping, exec: vi.fn() } as unknown as UpstashRedis;
    const adapter = upstashAdapter({
      client,
      metadata: async (c) => {
        expect(c).toBe(client);
        return { region: "eu" };
      },
    });
    const result = await adapter.check();
    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({ region: "eu", latencyMs: expect.any(Number) });
  });
});
