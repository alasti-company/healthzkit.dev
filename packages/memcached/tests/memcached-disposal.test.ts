import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { memcachedAdapter } from "../src/memcached.ts";

afterEach(() => {
  vi.doUnmock("memcached");
  vi.resetModules();
});

describe("memcachedAdapter disposal", () => {
  function fixture() {
    const client = {
      version: (done: (error: null, versions: unknown[]) => void) => done(null, [{ version: "1" }]),
    };
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const resource = { ...client, end: cleanup };
    const construct = vi.fn(function () {
      return resource;
    });
    vi.doMock("memcached", () => ({ default: construct }));
    return { resource, cleanup, construct };
  }

  test("disposes one lazily owned resource after concurrent checks, exactly once", async () => {
    const { cleanup, construct } = fixture();
    const adapter = memcachedAdapter({ servers: "localhost:11211" });
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
    const adapter = memcachedAdapter({ client: resource } as never);
    expect((await adapter.check()).status).toBe("ok");
    await adapter.dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  test("does not initialize an unused resource during disposal", async () => {
    const { cleanup, construct } = fixture();
    await memcachedAdapter({ servers: "localhost:11211" }).dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });
});
