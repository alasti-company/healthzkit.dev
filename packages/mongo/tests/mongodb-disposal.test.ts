import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { mongodbAdapter } from "../src/mongodb.ts";

afterEach(() => {
  vi.doUnmock("mongodb");
  vi.resetModules();
});

describe("mongodbAdapter disposal", () => {
  function fixture() {
    const client = {
      connect: vi.fn().mockResolvedValue(undefined),
      db: () => ({ command: vi.fn().mockResolvedValue({}) }),
    };
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const resource = { ...client, close: cleanup };
    const construct = vi.fn(function () {
      return resource;
    });
    vi.doMock("mongodb", () => ({ MongoClient: construct }));
    return { resource, cleanup, construct };
  }

  test("disposes one lazily owned resource after concurrent checks, exactly once", async () => {
    const { cleanup, construct } = fixture();
    const adapter = mongodbAdapter({ connectionString: "mongodb://localhost/db" });
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
    const adapter = mongodbAdapter({ client: resource } as never);
    expect((await adapter.check()).status).toBe("ok");
    await adapter.dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  test("does not initialize an unused resource during disposal", async () => {
    const { cleanup, construct } = fixture();
    await mongodbAdapter({ connectionString: "mongodb://localhost/db" }).dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  test("retains an owned client after connection failure so it can be disposed", async () => {
    const { resource, cleanup, construct } = fixture();
    resource.connect.mockRejectedValue(new Error("connect failed"));
    const adapter = mongodbAdapter({ connectionString: "mongodb://localhost/db" });
    expect((await adapter.check()).status).toBe("fail");
    expect((await adapter.check()).status).toBe("fail");
    await adapter.dispose!();
    expect(construct).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
