import { describe, expect, test, vi } from "vite-plus/test";
import { amqplibAdapter } from "../src/amqplib.ts";

function mockChannelModel(
  overrides: {
    createChannel?: () => Promise<{ close: () => Promise<void> }>;
  } = {},
) {
  const close = vi.fn().mockResolvedValue(undefined);
  const channel = { close };
  const createChannel = vi.fn(overrides.createChannel ?? (async () => channel));
  const model = { createChannel };
  return { model: model as never, createChannel, close };
}

describe("amqplibAdapter", () => {
  test("opens and closes a channel on injected connection and returns ok with latency", async () => {
    const { model, createChannel, close } = mockChannelModel();
    const adapter = amqplibAdapter({ connection: model });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(createChannel).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("reuses injected connection across checks", async () => {
    const { model, createChannel } = mockChannelModel();
    const adapter = amqplibAdapter({ connection: model });
    await adapter.check();
    await adapter.check();

    expect(createChannel).toHaveBeenCalledTimes(2);
  });

  test("returns fail when createChannel rejects", async () => {
    const { model } = mockChannelModel({
      createChannel: async () => {
        throw new Error("channel error");
      },
    });
    const result = await amqplibAdapter({ connection: model }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("channel error");
  });

  test("returns fail when channel close rejects", async () => {
    const { model } = mockChannelModel({
      createChannel: async () => ({
        close: async () => {
          throw new Error("close failed");
        },
      }),
    });
    const result = await amqplibAdapter({ connection: model }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("close failed");
  });

  test("includes metadata from optional metadata hook", async () => {
    const { model } = mockChannelModel();
    const adapter = amqplibAdapter({
      connection: model,
      metadata: (c) => {
        expect(c).toBe(model);
        return { vhost: "health" };
      },
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({ vhost: "health", latencyMs: expect.any(Number) });
  });

  test("awaits async metadata hook", async () => {
    const { model } = mockChannelModel();
    const adapter = amqplibAdapter({
      connection: model,
      metadata: async () => ({ queueCount: 2 }),
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      queueCount: 2,
      latencyMs: expect.any(Number),
    });
  });

  test("reuses internal connection across checks when using url", async () => {
    const { model, createChannel } = mockChannelModel();
    const connect = vi.fn().mockResolvedValue(model);
    vi.doMock("amqplib", () => ({ default: { connect } }));

    vi.resetModules();
    try {
      const { amqplibAdapter: adapterFactory } = await import("../src/amqplib.ts");
      const adapter = adapterFactory({
        url: "amqp://localhost",
        socketOptions: { timeout: 1000 },
      });

      await adapter.check();
      await adapter.check();

      expect(connect).toHaveBeenCalledOnce();
      expect(connect).toHaveBeenCalledWith("amqp://localhost", { timeout: 1000 });
      expect(createChannel).toHaveBeenCalledTimes(2);
    } finally {
      vi.doUnmock("amqplib");
      vi.resetModules();
    }
  });

  test("reuses a single connect across concurrent checks when using url", async () => {
    let connectCount = 0;
    const connect = vi.fn(async () => {
      connectCount += 1;
      return mockChannelModel().model;
    });
    vi.doMock("amqplib", () => ({ default: { connect } }));

    vi.resetModules();
    try {
      const { amqplibAdapter: adapterFactory } = await import("../src/amqplib.ts");
      const adapter = adapterFactory({ url: "amqp://localhost" });

      await Promise.all([adapter.check(), adapter.check()]);

      expect(connectCount).toBe(1);
    } finally {
      vi.doUnmock("amqplib");
      vi.resetModules();
    }
  });
});
