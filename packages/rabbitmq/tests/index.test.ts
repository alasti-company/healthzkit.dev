import { describe, expect, test } from "vite-plus/test";
import { amqpConnectionManagerAdapter, amqplibAdapter } from "../src/index.ts";

describe("package entry (src/index.ts)", () => {
  test("re-exports both rabbitmq adapters", async () => {
    const entry = await import("../src/index.ts");
    const amqplibMod = await import("../src/amqplib.ts");
    const connectionManagerMod = await import("../src/amqp-connection-manager.ts");

    expect(entry.amqplibAdapter).toBe(amqplibMod.amqplibAdapter);
    expect(entry.amqpConnectionManagerAdapter).toBe(
      connectionManagerMod.amqpConnectionManagerAdapter,
    );
  });

  test("adapters are usable from the barrel", async () => {
    const amqplib = amqplibAdapter({
      connection: {
        createChannel: async () => ({ close: async () => undefined }),
      } as never,
    });
    expect((await amqplib.check()).status).toBe("ok");

    const connectionManager = amqpConnectionManagerAdapter({
      connection: { isConnected: () => true } as never,
    });
    expect((await connectionManager.check()).status).toBe("ok");
  });
});
