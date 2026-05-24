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

  test("initializes a single owned client when checks run concurrently", async () => {
    let constructCount = 0;
    let resolveImport: (value: { Client: typeof Client }) => void;
    const importPromise = new Promise<{ Client: typeof Client }>((resolve) => {
      resolveImport = resolve;
    });
    const { client, listBuckets } = mockMinioClient();
    const Client = vi.fn(function (_config?: unknown) {
      constructCount += 1;
      return client;
    });

    vi.doMock("minio", () => importPromise);

    vi.resetModules();
    try {
      const { minioAdapter: adapterFactory } = await import("../src/minio.ts");
      const adapter = adapterFactory({
        config: { endPoint: "localhost", port: 9000, useSSL: false },
      } as MinioAdapterOptions);

      const first = adapter.check();
      const second = adapter.check();
      resolveImport!({ Client });
      await Promise.all([first, second]);

      expect(constructCount).toBe(1);
      expect(listBuckets).toHaveBeenCalledTimes(2);
    } finally {
      vi.doUnmock("minio");
      vi.resetModules();
    }
  });

  test("retries client initialization after a failed import", async () => {
    let constructCount = 0;
    let rejectImport: (reason: Error) => void;
    const importPromise = new Promise<{ Client: typeof Client }>((_resolve, reject) => {
      rejectImport = reject;
    });
    const { client, listBuckets } = mockMinioClient();
    const Client = vi.fn(function (_config?: unknown) {
      constructCount += 1;
      return client;
    });

    vi.doMock("minio", () => importPromise);

    vi.resetModules();
    try {
      const { minioAdapter: adapterFactory } = await import("../src/minio.ts");
      const adapter = adapterFactory({
        config: { endPoint: "localhost", port: 9000, useSSL: false },
      } as MinioAdapterOptions);

      const failed = adapter.check();
      rejectImport!(new Error("module load failed"));
      await expect(failed).resolves.toMatchObject({ status: "fail" });

      vi.doUnmock("minio");
      vi.doMock("minio", () => ({ Client }));

      const recovered = await adapter.check();
      expect(recovered.status).toBe("ok");
      expect(constructCount).toBe(1);
      expect(listBuckets).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock("minio");
      vi.resetModules();
    }
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
