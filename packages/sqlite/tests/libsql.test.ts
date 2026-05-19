import { describe, expect, test, vi } from "vite-plus/test";
import { libsqlAdapter } from "../src/libsql.ts";

function mockClient(
  overrides: {
    execute?: (sql: string) => Promise<unknown>;
  } = {},
) {
  const execute = vi.fn(overrides.execute ?? (async () => ({ rows: [] })));
  return { execute };
}

describe("libsqlAdapter", () => {
  test("fails when neither url nor client is provided", async () => {
    const adapter = libsqlAdapter({} as never);
    const result = await adapter.check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "libsqlAdapter: provide a non-empty url or a client",
    );
  });

  test("fails when url is empty", async () => {
    const adapter = libsqlAdapter({ url: "" });
    const result = await adapter.check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "libsqlAdapter: provide a non-empty url or a client",
    );
  });

  test("runs default query on injected client and returns ok with latency", async () => {
    const client = mockClient();
    const adapter = libsqlAdapter({ client: client as never });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(client.execute).toHaveBeenCalledWith("SELECT 1");
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("runs custom query when provided", async () => {
    const client = mockClient();
    const adapter = libsqlAdapter({
      client: client as never,
      query: "SELECT libsql_version()",
    });
    await adapter.check();

    expect(client.execute).toHaveBeenCalledWith("SELECT libsql_version()");
  });

  test("returns fail when execute rejects", async () => {
    const client = mockClient({
      execute: async () => {
        throw new Error("replication lag");
      },
    });
    const result = await libsqlAdapter({ client: client as never }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("replication lag");
  });

  test("includes metadata from optional metadata hook", async () => {
    const client = mockClient();
    const adapter = libsqlAdapter({
      client: client as never,
      metadata: (c) => {
        expect(c).toBe(client);
        return { region: "iad" };
      },
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({ region: "iad", latencyMs: expect.any(Number) });
  });

  test("reuses internal client across checks when using url", async () => {
    const client = mockClient();
    const createClient = vi.fn(() => client);
    vi.doMock("@libsql/client", () => ({ createClient }));

    vi.resetModules();
    try {
      const { libsqlAdapter: adapterFactory } = await import("../src/libsql.ts");
      const adapter = adapterFactory({
        url: "libsql://example.turso.io",
        authToken: "secret",
      });

      await adapter.check();
      await adapter.check();

      expect(createClient).toHaveBeenCalledOnce();
      expect(createClient).toHaveBeenCalledWith({
        url: "libsql://example.turso.io",
        authToken: "secret",
      });
      expect(client.execute).toHaveBeenCalledTimes(2);
    } finally {
      vi.doUnmock("@libsql/client");
      vi.resetModules();
    }
  });
});
