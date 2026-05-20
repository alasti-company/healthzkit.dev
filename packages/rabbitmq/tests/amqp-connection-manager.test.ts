import { describe, expect, test, vi } from "vite-plus/test";
import { amqpConnectionManagerAdapter } from "../src/amqp-connection-manager.ts";

function mockConnectionManager(
  overrides: {
    isConnected?: () => boolean;
  } = {},
) {
  const isConnected = vi.fn(overrides.isConnected ?? (() => true));
  const connection = { isConnected };
  return { connection: connection as never, isConnected };
}

describe("amqpConnectionManagerAdapter", () => {
  test("returns ok with latency when injected connection is connected", async () => {
    const { connection, isConnected } = mockConnectionManager();
    const adapter = amqpConnectionManagerAdapter({ connection });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(isConnected).toHaveBeenCalledOnce();
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("reuses injected connection across checks", async () => {
    const { connection, isConnected } = mockConnectionManager();
    const adapter = amqpConnectionManagerAdapter({ connection });
    await adapter.check();
    await adapter.check();

    expect(isConnected).toHaveBeenCalledTimes(2);
  });

  test("returns fail when connection manager is not connected", async () => {
    const { connection } = mockConnectionManager({ isConnected: () => false });
    const result = await amqpConnectionManagerAdapter({ connection }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "rabbitmq adapter: connection manager has no active connections.",
    );
  });

  test("includes metadata from optional metadata hook", async () => {
    const { connection } = mockConnectionManager();
    const adapter = amqpConnectionManagerAdapter({
      connection,
      metadata: (c) => {
        expect(c).toBe(connection);
        return { urls: ["amqp://localhost"] };
      },
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      urls: ["amqp://localhost"],
      latencyMs: expect.any(Number),
    });
  });

  test("awaits async metadata hook", async () => {
    const { connection } = mockConnectionManager();
    const adapter = amqpConnectionManagerAdapter({
      connection,
      metadata: async () => ({ heartbeat: 60 }),
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      heartbeat: 60,
      latencyMs: expect.any(Number),
    });
  });

  test("reuses internal connection across checks when using urls", async () => {
    const { connection, isConnected } = mockConnectionManager();
    const connect = vi.fn().mockReturnValue(connection);
    vi.doMock("amqp-connection-manager", () => ({ connect }));

    vi.resetModules();
    try {
      const { amqpConnectionManagerAdapter: adapterFactory } =
        await import("../src/amqp-connection-manager.ts");
      const adapter = adapterFactory({
        urls: ["amqp://localhost"],
        connectionOptions: { heartbeatIntervalInSeconds: 30 },
      });

      await adapter.check();
      await adapter.check();

      expect(connect).toHaveBeenCalledOnce();
      expect(connect).toHaveBeenCalledWith(["amqp://localhost"], {
        heartbeatIntervalInSeconds: 30,
      });
      expect(isConnected).toHaveBeenCalledTimes(2);
    } finally {
      vi.doUnmock("amqp-connection-manager");
      vi.resetModules();
    }
  });

  test("reuses a single connect across concurrent checks when using urls", async () => {
    let connectCount = 0;
    const connect = vi.fn(() => {
      connectCount += 1;
      return mockConnectionManager().connection;
    });
    vi.doMock("amqp-connection-manager", () => ({ connect }));

    vi.resetModules();
    try {
      const { amqpConnectionManagerAdapter: adapterFactory } =
        await import("../src/amqp-connection-manager.ts");
      const adapter = adapterFactory({ urls: ["amqp://localhost"] });

      await Promise.all([adapter.check(), adapter.check()]);

      expect(connectCount).toBe(1);
    } finally {
      vi.doUnmock("amqp-connection-manager");
      vi.resetModules();
    }
  });
});
