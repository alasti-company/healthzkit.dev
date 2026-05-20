import { describe, expect, test, vi } from "vite-plus/test";
import { dynamoV3Adapter, type DynamoV3AdapterOptions } from "../src/v3.ts";

function mockDynamoDBClient(
  overrides: {
    send?: (command: unknown) => Promise<unknown>;
  } = {},
) {
  const send = vi.fn(overrides.send ?? (async () => ({})));
  return { send };
}

describe("dynamoV3Adapter", () => {
  test("runs ListTablesCommand on injected client and returns ok with latency", async () => {
    const client = mockDynamoDBClient();
    const adapter = dynamoV3Adapter({ client: client as never });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(client.send).toHaveBeenCalledOnce();
    expect(client.send.mock.calls[0]?.[0]).toBeDefined();
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("returns fail when send rejects", async () => {
    const client = mockDynamoDBClient({
      send: async () => {
        throw new Error("ProvisionedThroughputExceededException");
      },
    });
    const result = await dynamoV3Adapter({ client: client as never }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("ProvisionedThroughputExceededException");
  });

  test("includes metadata from optional metadata hook", async () => {
    const client = mockDynamoDBClient();
    const adapter = dynamoV3Adapter({
      client: client as never,
      metadata: (c) => {
        expect(c).toBe(client);
        return { endpoint: "http://localhost:8000" };
      },
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      endpoint: "http://localhost:8000",
      latencyMs: expect.any(Number),
    });
  });

  test("awaits async metadata hook", async () => {
    const client = mockDynamoDBClient();
    const adapter = dynamoV3Adapter({
      client: client as never,
      metadata: async () => ({ accountId: "123" }),
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      accountId: "123",
      latencyMs: expect.any(Number),
    });
  });

  test("reuses internal client across checks when using config", async () => {
    const client = mockDynamoDBClient();
    const DynamoDBClient = vi.fn(function (_config?: unknown) {
      return client;
    });
    const ListTablesCommand = vi.fn(function (input: { Limit?: number }) {
      return { input, _type: "ListTablesCommand" };
    });
    vi.doMock("@aws-sdk/client-dynamodb", () => ({
      DynamoDBClient,
      ListTablesCommand,
    }));

    vi.resetModules();
    try {
      const { dynamoV3Adapter: adapterFactory } = await import("../src/v3.ts");
      const adapter = adapterFactory({
        config: { region: "ap-southeast-1" },
      } as DynamoV3AdapterOptions);

      await adapter.check();
      await adapter.check();

      expect(DynamoDBClient).toHaveBeenCalledOnce();
      expect(DynamoDBClient).toHaveBeenCalledWith({ region: "ap-southeast-1" });
      expect(client.send).toHaveBeenCalledTimes(2);
      expect(ListTablesCommand).toHaveBeenCalledWith({ Limit: 1 });
    } finally {
      vi.doUnmock("@aws-sdk/client-dynamodb");
      vi.resetModules();
    }
  });
});
