import { describe, expect, test, vi } from "vite-plus/test";
import { s3V3Adapter, type S3V3AdapterOptions } from "../src/v3.ts";

function mockS3Client(
  overrides: {
    send?: (command: unknown) => Promise<unknown>;
  } = {},
) {
  const send = vi.fn(overrides.send ?? (async () => ({ Buckets: [{ Name: "my-bucket" }] })));
  return { send };
}

describe("s3V3Adapter", () => {
  test("runs ListBucketsCommand on injected client and returns ok with latency", async () => {
    const client = mockS3Client();
    const adapter = s3V3Adapter({ client: client as never });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(client.send).toHaveBeenCalledOnce();
    expect(client.send.mock.calls[0]?.[0]).toBeDefined();
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata?.bucketCount).toBe(1);
  });

  test("returns fail when send rejects", async () => {
    const client = mockS3Client({
      send: async () => {
        throw new Error("AccessDenied");
      },
    });
    const result = await s3V3Adapter({ client: client as never }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("AccessDenied");
  });

  test("includes metadata from optional metadata hook", async () => {
    const client = mockS3Client();
    const adapter = s3V3Adapter({
      client: client as never,
      metadata: (c) => {
        expect(c).toBe(client);
        return { endpoint: "http://localhost:4566" };
      },
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      endpoint: "http://localhost:4566",
      bucketCount: 1,
      latencyMs: expect.any(Number),
    });
  });

  test("awaits async metadata hook", async () => {
    const client = mockS3Client();
    const adapter = s3V3Adapter({
      client: client as never,
      metadata: async () => ({ accountId: "456" }),
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      accountId: "456",
      bucketCount: 1,
      latencyMs: expect.any(Number),
    });
  });

  test("reuses internal client across checks when using config", async () => {
    const client = mockS3Client();
    const S3Client = vi.fn(function (_config?: unknown) {
      return client;
    });
    const ListBucketsCommand = vi.fn(function (input: Record<string, unknown>) {
      return { input, _type: "ListBucketsCommand" };
    });
    vi.doMock("@aws-sdk/client-s3", () => ({
      S3Client,
      ListBucketsCommand,
    }));

    vi.resetModules();
    try {
      const { s3V3Adapter: adapterFactory } = await import("../src/v3.ts");
      const adapter = adapterFactory({
        config: { region: "ap-southeast-1" },
      } as S3V3AdapterOptions);

      await adapter.check();
      await adapter.check();

      expect(S3Client).toHaveBeenCalledOnce();
      expect(S3Client).toHaveBeenCalledWith({ region: "ap-southeast-1" });
      expect(client.send).toHaveBeenCalledTimes(2);
      expect(ListBucketsCommand).toHaveBeenCalledWith({});
    } finally {
      vi.doUnmock("@aws-sdk/client-s3");
      vi.resetModules();
    }
  });
});
