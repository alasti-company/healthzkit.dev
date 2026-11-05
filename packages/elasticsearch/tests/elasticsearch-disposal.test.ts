import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { elasticsearchAdapter } from "../src/elasticsearch.ts";

afterEach(() => {
  vi.doUnmock("@elastic/elasticsearch");
  vi.resetModules();
});

describe("elasticsearchAdapter disposal", () => {
  function fixture() {
    const client = { cluster: { health: vi.fn().mockResolvedValue({ status: "green" }) } };
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const resource = { ...client, close: cleanup };
    const construct = vi.fn(function () {
      return resource;
    });
    vi.doMock("@elastic/elasticsearch", () => ({ Client: construct }));
    return { resource, cleanup, construct };
  }

  test("disposes one lazily owned resource after concurrent checks, exactly once", async () => {
    const { cleanup, construct } = fixture();
    const adapter = elasticsearchAdapter({ config: { node: "http://localhost:9200" } });
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
    const adapter = elasticsearchAdapter({ client: resource } as never);
    expect((await adapter.check()).status).toBe("ok");
    await adapter.dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  test("does not initialize an unused resource during disposal", async () => {
    const { cleanup, construct } = fixture();
    await elasticsearchAdapter({ config: { node: "http://localhost:9200" } }).dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });
});
