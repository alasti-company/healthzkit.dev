import { describe, expect, test, vi } from "vite-plus/test";
import { mongodbAdapter } from "../src/mongodb.ts";

function mockClient(
  overrides: {
    connect?: () => Promise<void>;
    command?: () => Promise<{ ok: number }>;
  } = {},
) {
  const connect = vi.fn(overrides.connect ?? (async () => undefined));
  const command = vi.fn(overrides.command ?? (async () => ({ ok: 1 })));
  const client = {
    connect,
    db: () => ({ command }),
  };
  return { client: client as never, connect, command };
}

describe("mongodbAdapter", () => {
  test("fails when neither connectionString nor client is provided", async () => {
    const adapter = mongodbAdapter({} as never);
    const result = await adapter.check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "mongoAdapter: provide a non-empty connectionString or a client",
    );
  });

  test("fails when connectionString is empty", async () => {
    const adapter = mongodbAdapter({ connectionString: "" });
    const result = await adapter.check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "mongoAdapter: provide a non-empty connectionString or a client",
    );
  });

  test("pings admin and returns ok with latency metadata", async () => {
    const { client, command } = mockClient();
    const adapter = mongodbAdapter({ client });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(command).toHaveBeenCalledWith({ ping: 1 });
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("connects injected client once across checks", async () => {
    const { client, connect, command } = mockClient();
    const adapter = mongodbAdapter({ client });
    await adapter.check();
    await adapter.check();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(command).toHaveBeenCalledTimes(2);
  });

  test("returns fail when ping rejects", async () => {
    const { client } = mockClient({
      command: async () => {
        throw new Error("not primary");
      },
    });
    const result = await mongodbAdapter({ client }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("not primary");
  });

  test("includes metadata from optional metadata hook", async () => {
    const { client } = mockClient();
    const adapter = mongodbAdapter({
      client,
      metadata: async (c) => {
        expect(c).toBe(client);
        return { cluster: "rs0" };
      },
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({ cluster: "rs0", latencyMs: expect.any(Number) });
  });

  test("close is a no-op for injected clients", async () => {
    const { client } = mockClient();
    const adapter = mongodbAdapter({ client });
    await adapter.check();
    await expect(adapter.close()).resolves.toBeUndefined();
  });

  test("reuses a single owned client across concurrent checks", async () => {
    let connectCount = 0;
    const close = vi.fn().mockResolvedValue(undefined);
    const MongoClient = vi.fn(function MongoClient(this: unknown) {
      return {
        connect: async () => {
          connectCount += 1;
        },
        db: () => ({
          command: vi.fn().mockResolvedValue({ ok: 1 }),
        }),
        close,
      };
    });

    vi.doMock("mongodb", () => ({ MongoClient }));

    const { mongodbAdapter: adapterFactory } = await import("../src/mongodb.ts");
    const adapter = adapterFactory({
      connectionString: "mongodb://localhost:27017",
      mongoOptions: { serverSelectionTimeoutMS: 100 },
    });

    await Promise.all([adapter.check(), adapter.check()]);

    expect(connectCount).toBe(1);
    expect(MongoClient).toHaveBeenCalledWith("mongodb://localhost:27017", {
      serverSelectionTimeoutMS: 100,
    });

    await adapter.close();
    expect(close).toHaveBeenCalledOnce();

    vi.doUnmock("mongodb");
  });

  test("close clears owned client so a later check reconnects", async () => {
    let connectCount = 0;
    const MongoClient = vi.fn(function MongoClient(this: unknown) {
      return {
        connect: async () => {
          connectCount += 1;
        },
        db: () => ({
          command: vi.fn().mockResolvedValue({ ok: 1 }),
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };
    });

    vi.doMock("mongodb", () => ({ MongoClient }));

    const { mongodbAdapter: adapterFactory } = await import("../src/mongodb.ts");
    const adapter = adapterFactory({ connectionString: "mongodb://localhost:27017" });

    await adapter.check();
    await adapter.close();
    await adapter.check();

    expect(connectCount).toBe(2);
    expect(MongoClient).toHaveBeenCalledTimes(2);

    vi.doUnmock("mongodb");
  });
});
