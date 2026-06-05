import { describe, expect, test, vi } from "vite-plus/test";
import type { GlideClient, GlideClientConfiguration } from "@valkey/valkey-glide";
import { glideValkeyAdapter } from "../src/valkey-glide.ts";

type GlideValkeyClient = Pick<GlideClient, "customCommand">;

describe("src/valkey-glide.ts", () => {
  test("fails when neither connectionString nor client is provided", async () => {
    const adapter = glideValkeyAdapter({} as never);
    const result = await adapter.check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "glideValkeyAdapter: provide a non-empty connectionString or a client",
    );
  });

  test("fails when connectionString is empty", async () => {
    const adapter = glideValkeyAdapter({ connectionString: "" });
    const result = await adapter.check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "glideValkeyAdapter: provide a non-empty connectionString or a client",
    );
  });

  test("customCommand with default PING when client is injected", async () => {
    const customCommand = vi.fn().mockResolvedValue("PONG");
    const client = { customCommand } as unknown as GlideValkeyClient;
    const adapter = glideValkeyAdapter({ client });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(customCommand).toHaveBeenCalledWith(["PING"]);
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("uses custom command split into argv", async () => {
    const customCommand = vi.fn().mockResolvedValue(undefined);
    const client = { customCommand } as unknown as GlideValkeyClient;
    const adapter = glideValkeyAdapter({ client, command: "ECHO hello" });
    await adapter.check();

    expect(customCommand).toHaveBeenCalledWith(["ECHO", "hello"]);
  });

  test("returns fail when customCommand rejects", async () => {
    const customCommand = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const client = { customCommand } as unknown as GlideValkeyClient;
    const result = await glideValkeyAdapter({ client }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("ECONNREFUSED");
  });

  test("includes metadata from optional metadata hook", async () => {
    const customCommand = vi.fn().mockResolvedValue(undefined);
    const client = { customCommand } as unknown as GlideValkeyClient;
    const adapter = glideValkeyAdapter({
      client,
      metadata: async (c) => {
        expect(c).toBe(client);
        return { mode: "standalone" };
      },
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({ mode: "standalone", latencyMs: expect.any(Number) });
  });

  test("fails when connectionString protocol is invalid", async () => {
    const adapter = glideValkeyAdapter({
      connectionString: "postgres://localhost/db",
    });
    const result = await adapter.check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "glideValkeyAdapter: invalid protocol in connectionString: postgres. expected redis://, rediss://, valkey://, or valkeys://",
    );
  });

  test("reuses internal client across checks when using connectionString", async () => {
    const customCommand = vi.fn().mockResolvedValue("PONG");
    const createClient = vi.fn(async () => ({ customCommand }));

    vi.doMock("@valkey/valkey-glide", () => ({
      GlideClient: { createClient },
    }));

    try {
      const { glideValkeyAdapter: adapterFactory } = await import("../src/valkey-glide.ts");
      const adapter = adapterFactory({
        connectionString: "valkey://user:secret@cache.example:6380/2",
        options: { requestTimeout: 5000 } as GlideClientConfiguration,
      });

      await adapter.check();
      await adapter.check();

      expect(createClient).toHaveBeenCalledOnce();
      expect(createClient).toHaveBeenCalledWith({
        addresses: [{ host: "cache.example", port: 6380 }],
        useTLS: false,
        credentials: { username: "user", password: "secret" },
        databaseId: 2,
        requestTimeout: 5000,
      });
      expect(customCommand).toHaveBeenCalledTimes(2);
    } finally {
      vi.doUnmock("@valkey/valkey-glide");
      vi.resetModules();
    }
  });

  test("parses rediss:// with default TLS port", async () => {
    const customCommand = vi.fn().mockResolvedValue("PONG");
    const createClient = vi.fn(async () => ({ customCommand }));

    vi.doMock("@valkey/valkey-glide", () => ({
      GlideClient: { createClient },
    }));

    try {
      const { glideValkeyAdapter: adapterFactory } = await import("../src/valkey-glide.ts");
      const adapter = adapterFactory({
        connectionString: "rediss://secure.example",
      });

      const result = await adapter.check();
      expect(result.status).toBe("ok");
      expect(createClient).toHaveBeenCalledWith({
        addresses: [{ host: "secure.example", port: 6380 }],
        useTLS: true,
      });
    } finally {
      vi.doUnmock("@valkey/valkey-glide");
      vi.resetModules();
    }
  });

  test("parses valkeys:// with TLS enabled", async () => {
    const customCommand = vi.fn().mockResolvedValue("PONG");
    const createClient = vi.fn(async () => ({ customCommand }));

    vi.doMock("@valkey/valkey-glide", () => ({
      GlideClient: { createClient },
    }));

    try {
      const { glideValkeyAdapter: adapterFactory } = await import("../src/valkey-glide.ts");
      const adapter = adapterFactory({
        connectionString: "valkeys://secure.example:7000",
      });

      const result = await adapter.check();
      expect(result.status).toBe("ok");
      expect(createClient).toHaveBeenCalledWith({
        addresses: [{ host: "secure.example", port: 7000 }],
        useTLS: true,
      });
    } finally {
      vi.doUnmock("@valkey/valkey-glide");
      vi.resetModules();
    }
  });
});
