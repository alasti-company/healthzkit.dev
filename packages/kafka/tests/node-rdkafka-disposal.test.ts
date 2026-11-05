import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { nodeRdKafkaAdapter } from "../src/node-rdkafka.ts";

afterEach(() => {
  vi.doUnmock("node-rdkafka");
  vi.resetModules();
});

describe("nodeRdKafkaAdapter disposal", () => {
  function fixture() {
    const client = {
      isConnected: () => true,
      getMetadata: (_options: unknown, done: (error: undefined) => void) => done(undefined),
    };
    const cleanup = vi.fn((done?: (error: null) => void) => {
      done?.(null);
    });
    const resource = { ...client, disconnect: cleanup };
    const construct = vi.fn(function () {
      return resource;
    });
    vi.doMock("node-rdkafka", () => ({ Producer: construct }));
    return { resource, cleanup, construct };
  }

  test("disposes one lazily owned resource after concurrent checks, exactly once", async () => {
    const { cleanup, construct } = fixture();
    const adapter = nodeRdKafkaAdapter({ config: { "metadata.broker.list": "localhost:9092" } });
    const results = await Promise.all([adapter.check(), adapter.check()]);
    expect(results.map((result) => result.status)).toEqual(["ok", "ok"]);
    const closing = adapter.dispose!();
    expect(adapter.dispose!()).toBe(closing);
    await closing;
    await adapter.dispose!();
    expect(construct).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
    expect((await adapter.check()).status).toBe("fail");
  });

  test("never cleans up a supplied resource", async () => {
    const { resource, cleanup, construct } = fixture();
    const adapter = nodeRdKafkaAdapter({ client: resource } as never);
    expect((await adapter.check()).status).toBe("ok");
    await adapter.dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  test("does not initialize an unused resource during disposal", async () => {
    const { cleanup, construct } = fixture();
    await nodeRdKafkaAdapter({ config: { "metadata.broker.list": "localhost:9092" } }).dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });
});
