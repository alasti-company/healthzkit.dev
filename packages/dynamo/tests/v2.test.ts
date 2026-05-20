import { describe, expect, test, vi } from "vite-plus/test";
import { dynamoV2Adapter } from "../src/v2.ts";

type ListTablesCallback = (error: Error | null) => void;

function mockDynamoDB(
  overrides: {
    listTables?: (params: { Limit?: number }, callback: ListTablesCallback) => void;
  } = {},
) {
  const listTables = vi.fn(
    overrides.listTables ??
      ((_params, callback) => {
        callback(null);
      }),
  );
  return { listTables };
}

describe("dynamoV2Adapter", () => {
  test("runs listTables on injected client and returns ok with latency", async () => {
    const client = mockDynamoDB();
    const adapter = dynamoV2Adapter({ client: client as never });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(client.listTables).toHaveBeenCalledWith({ Limit: 1 }, expect.any(Function));
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("returns fail when listTables reports an error", async () => {
    const client = mockDynamoDB({
      listTables: (_params, callback) => {
        callback(new Error("NetworkingError"));
      },
    });
    const result = await dynamoV2Adapter({ client: client as never }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("NetworkingError");
  });

  test("includes metadata from optional metadata hook", async () => {
    const client = mockDynamoDB();
    const adapter = dynamoV2Adapter({
      client: client as never,
      metadata: (c) => {
        expect(c).toBe(client);
        return { region: "us-east-1" };
      },
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      region: "us-east-1",
      latencyMs: expect.any(Number),
    });
  });

  test("awaits async metadata hook", async () => {
    const client = mockDynamoDB();
    const adapter = dynamoV2Adapter({
      client: client as never,
      metadata: async () => ({ tableCount: 2 }),
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      tableCount: 2,
      latencyMs: expect.any(Number),
    });
  });

  test("reuses internal client across checks when using config", async () => {
    const client = mockDynamoDB();
    const DynamoDB = vi.fn(function (_config?: unknown) {
      return client;
    });
    vi.doMock("aws-sdk", () => ({ default: { DynamoDB } }));

    vi.resetModules();
    try {
      const { dynamoV2Adapter: adapterFactory } = await import("../src/v2.ts");
      const adapter = adapterFactory({
        config: { region: "eu-west-1" },
      });

      await adapter.check();
      await adapter.check();

      expect(DynamoDB).toHaveBeenCalledOnce();
      expect(DynamoDB).toHaveBeenCalledWith({ region: "eu-west-1" });
      expect(client.listTables).toHaveBeenCalledTimes(2);
    } finally {
      vi.doUnmock("aws-sdk");
      vi.resetModules();
    }
  });
});
