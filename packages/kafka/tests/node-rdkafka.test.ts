import { describe, expect, test, vi } from "vite-plus/test";
import type { Producer as RdProducer } from "node-rdkafka";
import { nodeRdKafkaAdapter } from "../src/node-rdkafka.ts";

type MetadataCallback = (err: { message: string } | undefined) => void;

function mockRdKafkaClient(
  connected = true,
  overrides: {
    getMetadata?: (opts: object, cb: MetadataCallback) => void;
    connect?: (opts: object, cb: MetadataCallback) => void;
  } = {},
) {
  const getMetadata = vi.fn(
    overrides.getMetadata ??
      ((_opts, cb) => {
        cb(undefined);
      }),
  );
  const connect = vi.fn(
    overrides.connect ??
      ((_opts, cb) => {
        cb(undefined);
      }),
  );
  const isConnected = vi.fn(() => connected);
  const client = { isConnected, getMetadata, connect } as unknown as RdProducer;
  return { client, isConnected, getMetadata, connect };
}

describe("nodeRdKafkaAdapter", () => {
  test("fetches metadata via getMetadata when already connected", async () => {
    const { client, getMetadata, connect } = mockRdKafkaClient(true);
    const adapter = nodeRdKafkaAdapter({ client });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(getMetadata).toHaveBeenCalledOnce();
    expect(connect).not.toHaveBeenCalled();
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("connects and fetches metadata when not yet connected", async () => {
    const { client, getMetadata, connect } = mockRdKafkaClient(false);
    const adapter = nodeRdKafkaAdapter({ client });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(connect).toHaveBeenCalledOnce();
    expect(getMetadata).toHaveBeenCalledOnce();
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("reuses injected client across checks", async () => {
    const { client, getMetadata } = mockRdKafkaClient(true);
    const adapter = nodeRdKafkaAdapter({ client });
    await adapter.check();
    await adapter.check();

    expect(getMetadata).toHaveBeenCalledTimes(2);
  });

  test("returns fail when getMetadata reports an error", async () => {
    const { client } = mockRdKafkaClient(true, {
      getMetadata: (_opts, cb) => {
        cb({ message: "metadata failed" });
      },
    });
    const result = await nodeRdKafkaAdapter({ client }).check();

    expect(result.status).toBe("fail");
    expect(result.error).toBeDefined();
  });

  test("returns fail when connect reports an error", async () => {
    const { client } = mockRdKafkaClient(false, {
      connect: (_opts, cb) => {
        cb({ message: "connection failed" });
      },
    });
    const result = await nodeRdKafkaAdapter({ client }).check();

    expect(result.status).toBe("fail");
    expect(result.error).toBeDefined();
  });

  test("includes metadata from optional metadata hook", async () => {
    const { client } = mockRdKafkaClient(true);
    const adapter = nodeRdKafkaAdapter({
      client,
      metadata: (c) => {
        expect(c).toBe(client);
        return { broker: "localhost:9092" };
      },
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      broker: "localhost:9092",
      latencyMs: expect.any(Number),
    });
  });

  test("awaits async metadata hook", async () => {
    const { client } = mockRdKafkaClient(true);
    const adapter = nodeRdKafkaAdapter({
      client,
      metadata: async () => ({ topicCount: 4 }),
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      topicCount: 4,
      latencyMs: expect.any(Number),
    });
  });

  test("reuses internal producer across checks when using config", async () => {
    const { client } = mockRdKafkaClient(true);
    const Producer = vi.fn(function (_config?: unknown) {
      return client;
    });
    vi.doMock("node-rdkafka", () => ({ Producer }));

    vi.resetModules();
    try {
      const { nodeRdKafkaAdapter: adapterFactory } = await import("../src/node-rdkafka.ts");
      const adapter = adapterFactory({
        config: { "bootstrap.servers": "localhost:9092" },
      });

      await adapter.check();
      await adapter.check();

      expect(Producer).toHaveBeenCalledOnce();
      expect(Producer).toHaveBeenCalledWith({ "bootstrap.servers": "localhost:9092" });
    } finally {
      vi.doUnmock("node-rdkafka");
      vi.resetModules();
    }
  });

  test("retries client initialization after a failed import", async () => {
    let constructCount = 0;
    let rejectImport: (reason: Error) => void;
    const { client, getMetadata } = mockRdKafkaClient(true);
    const Producer = vi.fn(function (_config?: unknown) {
      constructCount += 1;
      return client;
    });
    const importPromise = new Promise<{ Producer: typeof Producer }>((_resolve, reject) => {
      rejectImport = reject;
    });

    vi.doMock("node-rdkafka", () => importPromise);

    vi.resetModules();
    const { nodeRdKafkaAdapter: adapterFactory } = await import("../src/node-rdkafka.ts");
    const adapter = adapterFactory({ config: { "bootstrap.servers": "localhost:9092" } });

    const failed = adapter.check();
    rejectImport!(new Error("module load failed"));
    await expect(failed).resolves.toMatchObject({ status: "fail" });

    vi.doUnmock("node-rdkafka");
    vi.doMock("node-rdkafka", () => ({ Producer }));

    const recovered = await adapter.check();
    expect(recovered.status).toBe("ok");
    expect(constructCount).toBe(1);
    expect(getMetadata).toHaveBeenCalledOnce();

    vi.doUnmock("node-rdkafka");
    vi.resetModules();
  });
});
