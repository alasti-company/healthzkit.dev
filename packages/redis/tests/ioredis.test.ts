import { describe, expect, test, vi } from "vite-plus/test";
import type { Redis } from "ioredis";
import { ioredisAdapter } from "../src/ioredis.ts";

describe("src/ioredis.ts", () => {
  test("calls default PING via call()", async () => {
    const call = vi.fn().mockResolvedValue("PONG");
    const client = { call } as unknown as Redis;
    const adapter = ioredisAdapter({ client });
    const result = await adapter.check();
    expect(result.status).toBe("ok");
    expect(call).toHaveBeenCalledWith("PING");
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test.each([
    ["PING", ["PING"]],
    ["ECHO hello", ["ECHO", "hello"]],
    ["EXISTS first second", ["EXISTS", "first", "second"]],
  ])("passes custom command %s as separate command and arguments", async (command, argv) => {
    const call = vi.fn().mockResolvedValue(undefined);
    const client = { call } as unknown as Redis;
    const adapter = ioredisAdapter({ client, command });
    const result = await adapter.check();
    expect(result.status).toBe("ok");
    expect(call).toHaveBeenCalledExactlyOnceWith(...argv);
  });

  test("returns fail when call rejects", async () => {
    const call = vi.fn().mockRejectedValue(new Error("LOADING"));
    const client = { call } as unknown as Redis;
    const result = await ioredisAdapter({ client }).check();
    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("LOADING");
  });

  test("includes metadata from optional metadata hook", async () => {
    const call = vi.fn().mockResolvedValue(undefined);
    const client = { call } as unknown as Redis;
    const adapter = ioredisAdapter({
      client,
      metadata: async (c) => {
        expect(c).toBe(client);
        return { role: "master" };
      },
    });
    const result = await adapter.check();
    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({ role: "master", latencyMs: expect.any(Number) });
  });
});
