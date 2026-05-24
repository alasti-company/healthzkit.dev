import { describe, expect, test, vi } from "vite-plus/test";
import type { Client } from "minio";
import { minioAdapter, type MinioAdapterOptions } from "../src/minio.ts";

function mockMinioClient(
  overrides: {
    listBuckets?: () => Promise<{ name: string }[]>;
  } = {},
) {
  const listBuckets = vi.fn(overrides.listBuckets ?? (async () => [{ name: "my-bucket" }]));
  const client = { listBuckets };
  return { client: client as unknown as Client, listBuckets };
}

describe("minioAdapter", () => {
  test("runs listBuckets on injected client and returns ok with latency", async () => {
    const { client, listBuckets } = mockMinioClient();
    const adapter = minioAdapter({ client });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(listBuckets).toHaveBeenCalledOnce();
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("returns fail when listBuckets rejects", async () => {
    const { client } = mockMinioClient({
      listBuckets: async () => {
        throw new Error("AccessDenied");
      },
    });
    const result = await minioAdapter({ client }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("AccessDenied");
  });

  test("includes metadata from optional sync metadata hook", async () => {
    const { client } = mockMinioClient();
    const adapter = minioAdapter({
      client,
      metadata: (c) => {
        expect(c).toBe(client);
        return { endpoint: "http://localhost:9000" };
      },
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      endpoint: "http://localhost:9000",
      latencyMs: expect.any(Number),
    });
  });

  test("awaits async metadata hook", async () => {
    const { client } = mockMinioClient();
    const adapter = minioAdapter({
      client,
      metadata: async (c) => {
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

  test("reuses injected client across checks", async () => {
    const { client, listBuckets } = mockMinioClient();
    const adapter = minioAdapter({ client });
    await adapter.check();
    await adapter.check();

    expect(listBuckets).toHaveBeenCalledTimes(2);
  });

  test("reuses internal client across checks when using config", async () => {
    const { client, listBuckets } = mockMinioClient();
    const Client = vi.fn(function (_config?: unknown) {
      return client;
    });

    vi.doMock("minio", () => ({ Client }));

    vi.resetModules();
    try {
      const { minioAdapter: adapterFactory } = await import("../src/minio.ts");
      const adapter = adapterFactory({
        config: { endPoint: "localhost", port: 9000, useSSL: false },
      } as MinioAdapterOptions);

      await adapter.check();
      await adapter.check();

      expect(Client).toHaveBeenCalledOnce();
      expect(Client).toHaveBeenCalledWith({
        endPoint: "localhost",
        port: 9000,
        useSSL: false,
      });
      expect(listBuckets).toHaveBeenCalledTimes(2);
    } finally {
      vi.doUnmock("minio");
      vi.resetModules();
    }
  });
});
