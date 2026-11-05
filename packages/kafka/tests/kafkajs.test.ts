import { describe, expect, test, vi } from "vite-plus/test";
import type { Kafka } from "kafkajs";
import { kafkajsAdapter } from "../src/kafkajs.ts";

function mockKafka(
  overrides: {
    connect?: () => Promise<void>;
    describeCluster?: () => Promise<unknown>;
    disconnect?: () => Promise<void>;
  } = {},
) {
  const disconnect = vi.fn(overrides.disconnect ?? (async () => undefined));
  const describeCluster = vi.fn(overrides.describeCluster ?? (async () => ({ brokers: [] })));
  const connect = vi.fn(overrides.connect ?? (async () => undefined));
  const admin = { connect, describeCluster, disconnect };
  const adminFn = vi.fn(() => admin);
  const client = { admin: adminFn } as unknown as Kafka;
  return { client, admin, adminFn, connect, describeCluster, disconnect };
}

describe("kafkajsAdapter", () => {
  test("does not disconnect a successfully released admin again on disposal", async () => {
    const { client, disconnect } = mockKafka();
    const adapter = kafkajsAdapter({ client });
    await adapter.check();
    await adapter.dispose!();
    expect(disconnect).toHaveBeenCalledOnce();
    expect((await adapter.check()).status).toBe("fail");
  });

  test("bounds retained admins while retrying disconnects, including concurrent checks", async () => {
    const error = new Error("disconnect failed");
    const { client, adminFn, disconnect } = mockKafka({
      disconnect: async () => {
        throw error;
      },
    });
    const adapter = kafkajsAdapter({ client });
    expect((await adapter.check()).status).toBe("ok");
    const results = await Promise.all(Array.from({ length: 20 }, () => adapter.check()));
    expect(results.every((result) => result.status === "fail")).toBe(true);
    expect(adminFn).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledTimes(21);
    disconnect.mockResolvedValue(undefined);
    expect((await adapter.check()).status).toBe("ok");
    expect(adminFn).toHaveBeenCalledTimes(2);
    await adapter.dispose!();
  });

  test("retains disposal failures without retrying terminal cleanup", async () => {
    const error = new Error("disconnect failed");
    const { client, disconnect } = mockKafka({
      disconnect: async () => {
        throw error;
      },
    });
    const adapter = kafkajsAdapter({ client });
    await adapter.check();
    const closing = adapter.dispose!();
    await expect(closing).rejects.toMatchObject({ name: "AggregateError", errors: [error] });
    expect(adapter.dispose!()).toBe(closing);
    expect(disconnect).toHaveBeenCalledTimes(2);
  });

  test("connects admin, describes cluster, disconnects, and returns ok with latency", async () => {
    const { client, adminFn, connect, describeCluster, disconnect } = mockKafka();
    const adapter = kafkajsAdapter({ client });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(adminFn).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledOnce();
    expect(describeCluster).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("reuses injected client across checks", async () => {
    const { client, adminFn } = mockKafka();
    const adapter = kafkajsAdapter({ client });
    await adapter.check();
    await adapter.check();

    expect(adminFn).toHaveBeenCalledTimes(2);
  });

  test("returns fail when describeCluster rejects", async () => {
    const { client } = mockKafka({
      describeCluster: async () => {
        throw new Error("cluster unavailable");
      },
    });
    const result = await kafkajsAdapter({ client }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("cluster unavailable");
  });

  test("returns fail when admin connect rejects", async () => {
    const { client } = mockKafka({
      connect: async () => {
        throw new Error("connection refused");
      },
    });
    const result = await kafkajsAdapter({ client }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("connection refused");
  });

  test("disconnects admin even when describeCluster fails", async () => {
    const { client, disconnect } = mockKafka({
      describeCluster: async () => {
        throw new Error("describe failed");
      },
    });
    await kafkajsAdapter({ client }).check();

    expect(disconnect).toHaveBeenCalledOnce();
  });

  test("includes metadata from optional metadata hook", async () => {
    const { client } = mockKafka();
    const adapter = kafkajsAdapter({
      client,
      metadata: (c) => {
        expect(c).toBe(client);
        return { clusterId: "abc" };
      },
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      clusterId: "abc",
      latencyMs: expect.any(Number),
    });
  });

  test("awaits async metadata hook", async () => {
    const { client } = mockKafka();
    const adapter = kafkajsAdapter({
      client,
      metadata: async () => ({ brokerCount: 2 }),
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      brokerCount: 2,
      latencyMs: expect.any(Number),
    });
  });

  test("reuses internal client across checks when using config", async () => {
    const { client } = mockKafka();
    const Kafka = vi.fn(function (_config?: unknown) {
      return client;
    });
    vi.doMock("kafkajs", () => ({ Kafka }));

    vi.resetModules();
    try {
      const { kafkajsAdapter: adapterFactory } = await import("../src/kafkajs.ts");
      const adapter = adapterFactory({
        config: { brokers: ["localhost:9092"] },
      });

      await adapter.check();
      await adapter.check();

      expect(Kafka).toHaveBeenCalledOnce();
      expect(Kafka).toHaveBeenCalledWith({ brokers: ["localhost:9092"] });
    } finally {
      vi.doUnmock("kafkajs");
      vi.resetModules();
    }
  });
});
