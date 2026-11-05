import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { mongooseAdapter } from "../src/mongoose.ts";

afterEach(() => {
  vi.doUnmock("mongoose");
  vi.resetModules();
});

describe("mongooseAdapter disposal", () => {
  function fixture() {
    const client = {
      readyState: 1,
      asPromise: vi.fn().mockResolvedValue(undefined),
      db: { admin: () => ({ command: vi.fn().mockResolvedValue({}) }) },
    };
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const resource = { ...client, close: cleanup };
    const construct = vi.fn(function () {
      return resource;
    });
    vi.doMock("mongoose", () => ({ default: { createConnection: construct } }));
    return { resource, cleanup, construct };
  }

  test("disposes one lazily owned resource after concurrent checks, exactly once", async () => {
    const { cleanup, construct } = fixture();
    const adapter = mongooseAdapter({ connectionString: "mongodb://localhost/db" });
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
    const adapter = mongooseAdapter({ connection: resource } as never);
    expect((await adapter.check()).status).toBe("ok");
    await adapter.dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  test("does not initialize an unused resource during disposal", async () => {
    const { cleanup, construct } = fixture();
    await mongooseAdapter({ connectionString: "mongodb://localhost/db" }).dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });
});
