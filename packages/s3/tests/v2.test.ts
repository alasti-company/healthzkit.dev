import { describe, expect, test, vi } from "vite-plus/test";
import { s3V2Adapter } from "../src/v2.ts";

type ListBucketsCallback = (error: Error | null, data?: { Buckets?: unknown[] }) => void;

function mockS3(
  overrides: {
    listBuckets?: (callback: ListBucketsCallback) => void;
  } = {},
) {
  const listBuckets = vi.fn(
    overrides.listBuckets ??
      ((callback) => {
        callback(null, { Buckets: [{ Name: "my-bucket" }] });
      }),
  );
  return { listBuckets };
}

describe("s3V2Adapter", () => {
  test("runs listBuckets on injected client and returns ok with latency", async () => {
    const client = mockS3();
    const adapter = s3V2Adapter({ client: client as never });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(client.listBuckets).toHaveBeenCalledWith(expect.any(Function));
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata?.bucketCount).toBe(1);
  });

  test("returns fail when listBuckets reports an error", async () => {
    const client = mockS3({
      listBuckets: (callback) => {
        callback(new Error("NetworkingError"));
      },
    });
    const result = await s3V2Adapter({ client: client as never }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("NetworkingError");
  });

  test("includes metadata from optional metadata hook", async () => {
    const client = mockS3();
    const adapter = s3V2Adapter({
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
      bucketCount: 1,
      latencyMs: expect.any(Number),
    });
  });

  test("awaits async metadata hook", async () => {
    const client = mockS3();
    const adapter = s3V2Adapter({
      client: client as never,
      metadata: async () => ({ accountId: "123" }),
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      accountId: "123",
      bucketCount: 1,
      latencyMs: expect.any(Number),
    });
  });

  test("reuses internal client across checks when using config", async () => {
    const client = mockS3();
    const S3 = vi.fn(function (_config?: unknown) {
      return client;
    });
    vi.doMock("aws-sdk", () => ({ default: { S3 } }));

    vi.resetModules();
    try {
      const { s3V2Adapter: adapterFactory } = await import("../src/v2.ts");
      const adapter = adapterFactory({
        config: { region: "eu-west-1" },
      });

      await adapter.check();
      await adapter.check();

      expect(S3).toHaveBeenCalledOnce();
      expect(S3).toHaveBeenCalledWith({ region: "eu-west-1" });
      expect(client.listBuckets).toHaveBeenCalledTimes(2);
    } finally {
      vi.doUnmock("aws-sdk");
      vi.resetModules();
    }
  });
});
