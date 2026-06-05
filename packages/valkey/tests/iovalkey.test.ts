import { describe, expect, test, vi } from "vite-plus/test";
import type { Redis } from "iovalkey";
import { iovalkeyAdapter } from "../src/iovalkey.ts";

describe("src/iovalkey.ts", () => {
  test("fails when neither connectionString nor client is provided", async () => {
    const adapter = iovalkeyAdapter({} as never);
    const result = await adapter.check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "iovalkeyAdapter: provide a non-empty connectionString or a client",
    );
  });

  test("fails when connectionString is empty", async () => {
    const adapter = iovalkeyAdapter({ connectionString: "" });
    const result = await adapter.check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "iovalkeyAdapter: provide a non-empty connectionString or a client",
    );
  });

  test("calls default PING via call()", async () => {
    const call = vi.fn().mockResolvedValue("PONG");
    const client = { call } as unknown as Redis;
    const adapter = iovalkeyAdapter({ client });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(call).toHaveBeenCalledWith("PING");
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("uses custom command string", async () => {
    const call = vi.fn().mockResolvedValue(undefined);
    const client = { call } as unknown as Redis;
    const adapter = iovalkeyAdapter({ client, command: "ECHO x" });
    await adapter.check();

    expect(call).toHaveBeenCalledWith("ECHO x");
  });

  test("returns fail when call rejects", async () => {
    const call = vi.fn().mockRejectedValue(new Error("LOADING"));
    const client = { call } as unknown as Redis;
    const result = await iovalkeyAdapter({ client }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("LOADING");
  });

  test("includes metadata from optional metadata hook", async () => {
    const call = vi.fn().mockResolvedValue(undefined);
    const client = { call } as unknown as Redis;
    const adapter = iovalkeyAdapter({
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

  test("reuses internal client across checks when using connectionString", async () => {
    const call = vi.fn().mockResolvedValue("PONG");
    const Redis = vi.fn(function Redis() {
      return { call };
    });

    vi.doMock("iovalkey", () => ({ Redis }));

    try {
      const { iovalkeyAdapter: adapterFactory } = await import("../src/iovalkey.ts");
      const adapter = adapterFactory({
        connectionString: "redis://localhost:6379",
        options: { maxRetriesPerRequest: 1 },
      });

      await adapter.check();
      await adapter.check();

      expect(Redis).toHaveBeenCalledOnce();
      expect(Redis).toHaveBeenCalledWith("redis://localhost:6379", {
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
      });
      expect(call).toHaveBeenCalledTimes(2);
    } finally {
      vi.doUnmock("iovalkey");
      vi.resetModules();
    }
  });
});
