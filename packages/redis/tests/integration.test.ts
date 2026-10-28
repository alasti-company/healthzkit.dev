import { createServer } from "node:net";
import { once } from "node:events";
import { Redis } from "ioredis";
import { describe, expect, it } from "vite-plus/test";
import { ioredisAdapter } from "../src/ioredis.ts";

const integration = process.env.HEALTHZKIT_INTEGRATION === "1";
const url = process.env.HEALTHZKIT_REDIS_URL;
const redisOptions = {
  lazyConnect: true,
  retryStrategy: () => null,
  maxRetriesPerRequest: 0,
  connectTimeout: 1_000,
};

describe.skipIf(!integration)("ioredis real-service integration", () => {
  it("reuses the caller's connection and lets the owner close it", async () => {
    if (!url) throw new Error("Set HEALTHZKIT_REDIS_URL for integration tests");
    const client = new Redis(url, redisOptions);
    client.on("error", () => {}); // The adapter reports command/connect failures as check results.
    try {
      const adapter = ioredisAdapter({ client });
      let connectionId: unknown;
      for (let index = 0; index < 10; index++) {
        expect((await adapter.check()).status).toBe("ok");
        expect(client.status).toBe("ready");
        const currentId = await client.call("CLIENT", "ID");
        connectionId ??= currentId;
        expect(currentId).toBe(connectionId);
      }
      const failing = ioredisAdapter({ client, command: "HEALTHZKIT_UNKNOWN_COMMAND" });
      expect((await failing.check()).status).toBe("fail");
      expect(client.status).toBe("ready");
      expect((await adapter.check()).status).toBe("ok");
      expect(await client.ping()).toBe("PONG");
    } finally {
      if (client.status !== "end") {
        const ended = once(client, "end");
        client.disconnect();
        await ended;
      }
    }
    expect(client.status).toBe("end");
  });

  it("reports an unavailable service without reconnecting or leaving an open connection", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP address");
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    const client = new Redis(`redis://127.0.0.1:${address.port}`, redisOptions);
    client.on("error", () => {});
    try {
      const adapter = ioredisAdapter({ client });
      for (let index = 0; index < 3; index++) {
        const result = await adapter.check();
        expect(result.status).toBe("fail");
        expect(result.error).toBeTruthy();
        expect(client.status).toBe("end");
      }
    } finally {
      client.disconnect();
    }
  });
});
