import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import type Memcached from "memcached";
import type { Client } from "memjs";
import { memcachedAdapter, memjsAdapter } from "../src/index.ts";

function versionClient(error?: unknown, versions: unknown = [{ version: "1.6.39" }]) {
  const version = vi.fn((callback: (error: unknown, versions: unknown) => void) => {
    callback(error, versions);
  });
  return { client: { version } as unknown as Memcached, version };
}

function getClient() {
  const get = vi.fn().mockResolvedValue({ value: null, flags: null });
  return { client: { get } as unknown as Client, get };
}

afterEach(() => {
  vi.doUnmock("memcached");
  vi.doUnmock("memjs");
  vi.resetModules();
});

describe("memcachedAdapter", () => {
  test("checks versions and merges metadata with measured latency", async () => {
    const { client, version } = versionClient();
    const metadata = vi.fn(() => ({ region: "local", latencyMs: -1 }));
    const result = await memcachedAdapter({ client, metadata }).check();
    expect(version).toHaveBeenCalledOnce();
    expect(metadata).toHaveBeenCalledExactlyOnceWith(client);
    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({ region: "local", latencyMs: expect.any(Number) });
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test.each([new Error("connection refused"), ["first server down"], "timeout"])(
    "fails on callback error %s even with a healthy server response",
    async (error) => {
      const { client } = versionClient(error);
      const metadata = vi.fn();
      const result = await memcachedAdapter({ client, metadata }).check();
      expect(result.status).toBe("fail");
      expect(result.error).toBeInstanceOf(Error);
      expect(metadata).not.toHaveBeenCalled();
    },
  );

  test.each([[], undefined, [false], [{}]])(
    "fails on missing version response %j",
    async (versions) => {
      const { client } = versionClient(undefined, versions === undefined ? null : versions);
      const result = await memcachedAdapter({ client }).check();
      expect(result.status).toBe("fail");
    },
  );

  test("catches synchronous client errors and async metadata errors", async () => {
    const { client, version } = versionClient();
    version.mockImplementation(() => {
      throw new Error("closed");
    });
    expect((await memcachedAdapter({ client }).check()).status).toBe("fail");
    const healthy = versionClient().client;
    const result = await memcachedAdapter({
      client: healthy,
      metadata: async () => {
        throw new Error("metadata unavailable");
      },
    }).check();
    expect(result.status).toBe("fail");
    expect(result.error).toEqual(new Error("metadata unavailable"));
  });

  test.each(["", "  ", [], {}, ["localhost:11211", " "]])(
    "rejects empty servers %j",
    async (servers) => {
      expect((await memcachedAdapter({ servers }).check()).status).toBe("fail");
    },
  );

  test.each(["localhost:11211", ["localhost:11211"], { "localhost:11211": 2 }])(
    "lazily creates and reuses one client for concurrent checks with servers %j",
    async (servers) => {
      const { client, version } = versionClient();
      const constructor = vi.fn(function () {
        return client;
      });
      vi.doMock("memcached", () => ({ default: constructor }));
      const { memcachedAdapter: factory } = await import("../src/memcached.ts");
      const adapter = factory({ servers, options: { retries: 3, timeout: 100 } });
      expect(constructor).not.toHaveBeenCalled();
      const results = await Promise.all([adapter.check(), adapter.check()]);
      expect(results.map((result) => result.status)).toEqual(["ok", "ok"]);
      expect(constructor).toHaveBeenCalledExactlyOnceWith(servers, { retries: 3, timeout: 100 });
      expect(version).toHaveBeenCalledTimes(2);
    },
  );
});

describe("memjsAdapter", () => {
  test("treats a cache miss as healthy and uses the default key", async () => {
    const { client, get } = getClient();
    const result = await memjsAdapter({ client }).check();
    expect(result.status).toBe("ok");
    expect(get).toHaveBeenCalledExactlyOnceWith("healthzkit:healthcheck");
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("reads a custom key and awaits metadata", async () => {
    const { client, get } = getClient();
    get.mockResolvedValue({ value: Buffer.from("present"), flags: null });
    const metadata = vi.fn(async () => ({ region: "local" }));
    const result = await memjsAdapter({ client, key: "probe", metadata }).check();
    expect(get).toHaveBeenCalledExactlyOnceWith("probe");
    expect(metadata).toHaveBeenCalledExactlyOnceWith(client);
    expect(result.metadata).toMatchObject({ region: "local", latencyMs: expect.any(Number) });
  });

  test.each(["", " ", "with space", "nul\0key", "é".repeat(126)])(
    "rejects invalid key %j before I/O",
    async (key) => {
      const { client, get } = getClient();
      expect((await memjsAdapter({ client, key }).check()).status).toBe("fail");
      expect(get).not.toHaveBeenCalled();
    },
  );

  test("accepts a key at the byte limit", async () => {
    const { client } = getClient();
    expect((await memjsAdapter({ client, key: "é".repeat(125) }).check()).status).toBe("ok");
  });

  test("propagates client rejection and skips metadata", async () => {
    const { client, get } = getClient();
    get.mockRejectedValue(new Error("authentication failed"));
    const metadata = vi.fn();
    const result = await memjsAdapter({ client, metadata }).check();
    expect(result.status).toBe("fail");
    expect(result.error).toEqual(new Error("authentication failed"));
    expect(metadata).not.toHaveBeenCalled();
  });

  test("catches metadata errors", async () => {
    const { client } = getClient();
    const result = await memjsAdapter({
      client,
      metadata: () => {
        throw "metadata failed";
      },
    }).check();
    expect(result.error).toEqual(new Error("metadata failed"));
  });

  test.each(["", " ", "localhost:11211,"])("rejects empty servers %j", async (servers) => {
    expect((await memjsAdapter({ servers }).check()).status).toBe("fail");
  });

  test("lazily creates and reuses one client for concurrent checks", async () => {
    const { client, get } = getClient();
    const create = vi.fn(() => client);
    vi.doMock("memjs", () => ({ Client: { create } }));
    const { memjsAdapter: factory } = await import("../src/memjs.ts");
    const adapter = factory({
      servers: "localhost:11211",
      options: { username: "user", password: "pass", timeout: 0.2 },
    });
    expect(create).not.toHaveBeenCalled();
    const results = await Promise.all([adapter.check(), adapter.check()]);
    expect(results.map((result) => result.status)).toEqual(["ok", "ok"]);
    expect(create).toHaveBeenCalledExactlyOnceWith("localhost:11211", {
      retries: 1,
      username: "user",
      password: "pass",
      timeout: 0.2,
    });
    expect(get).toHaveBeenCalledTimes(2);
  });

  test("retries client creation after a construction failure", async () => {
    const { client } = getClient();
    const create = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("setup failed");
      })
      .mockReturnValue(client);
    vi.doMock("memjs", () => ({ Client: { create } }));
    const { memjsAdapter: factory } = await import("../src/memjs.ts");
    const adapter = factory({ servers: "localhost:11211" });
    expect((await adapter.check()).status).toBe("fail");
    expect((await adapter.check()).status).toBe("ok");
    expect(create).toHaveBeenCalledTimes(2);
  });
});
