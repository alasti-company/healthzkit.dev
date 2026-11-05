import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { nodeRedisAdapter } from "../src/redis.ts";

afterEach(() => {
  vi.doUnmock("redis");
  vi.resetModules();
});

describe("nodeRedisAdapter disposal", () => {
  function fixture() {
    const client = {
      isOpen: true,
      connect: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn().mockResolvedValue("PONG"),
    };
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const resource = { ...client, quit: cleanup };
    const construct = vi.fn(function () {
      return resource;
    });
    vi.doMock("redis", () => ({ createClient: construct }));
    return { resource, cleanup, construct };
  }

  test("disposes one lazily owned resource after concurrent checks, exactly once", async () => {
    const { cleanup, construct } = fixture();
    const adapter = nodeRedisAdapter({ connectionString: "redis://localhost" });
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

  test("rechecks isOpen and shares reconnection after the owned client closes", async () => {
    const { resource, construct } = fixture();
    resource.connect.mockImplementation(async () => {
      resource.isOpen = true;
    });
    resource.sendCommand.mockImplementation(async () => {
      if (!resource.isOpen) throw new Error("client closed");
      return "PONG";
    });
    const adapter = nodeRedisAdapter({ connectionString: "redis://localhost" });
    expect((await adapter.check()).status).toBe("ok");
    resource.isOpen = false;
    expect((await Promise.all([adapter.check(), adapter.check()])).map((r) => r.status)).toEqual([
      "ok",
      "ok",
    ]);
    expect(resource.connect).toHaveBeenCalledOnce();
    expect(construct).toHaveBeenCalledOnce();
    await adapter.dispose!();
    resource.isOpen = false;
    expect((await adapter.check()).status).toBe("fail");
    expect(resource.connect).toHaveBeenCalledOnce();
  });

  test("never cleans up a supplied resource", async () => {
    const { resource, cleanup, construct } = fixture();
    const adapter = nodeRedisAdapter({ client: resource } as never);
    expect((await adapter.check()).status).toBe("ok");
    await adapter.dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  test("does not initialize an unused resource during disposal", async () => {
    const { cleanup, construct } = fixture();
    await nodeRedisAdapter({ connectionString: "redis://localhost" }).dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });
});
