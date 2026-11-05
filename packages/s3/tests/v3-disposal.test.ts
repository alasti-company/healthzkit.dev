import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { s3V3Adapter } from "../src/v3.ts";

afterEach(() => {
  vi.doUnmock("@aws-sdk/client-s3");
  vi.resetModules();
});

describe("s3V3Adapter disposal", () => {
  function fixture() {
    const client = { send: vi.fn().mockResolvedValue({ Buckets: [] }) };
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const resource = { ...client, destroy: cleanup };
    const construct = vi.fn(function () {
      return resource;
    });
    vi.doMock("@aws-sdk/client-s3", () => ({ S3Client: construct, ListBucketsCommand: class {} }));
    return { resource, cleanup, construct };
  }

  test("disposes one lazily owned resource after concurrent checks, exactly once", async () => {
    const { cleanup, construct } = fixture();
    const adapter = s3V3Adapter({ config: {} });
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
    const adapter = s3V3Adapter({ client: resource } as never);
    expect((await adapter.check()).status).toBe("ok");
    await adapter.dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  test("does not initialize an unused resource during disposal", async () => {
    const { cleanup, construct } = fixture();
    await s3V3Adapter({ config: {} }).dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });
});
