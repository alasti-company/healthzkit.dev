import amqplib from "amqplib";
import { AmqpConnectionManagerClass } from "amqp-connection-manager";
import { describe, expect, it } from "vite-plus/test";
import { refusedPort, serviceUrl } from "../../../tools/shared/test-support/integration.ts";
import { amqplibAdapter } from "../src/amqplib.ts";
import { amqpConnectionManagerAdapter } from "../src/amqp-connection-manager.ts";

describe.skipIf(process.env.HEALTHZKIT_INTEGRATION !== "1")(
  "RabbitMQ real-service integration",
  () => {
    it("repeats channel probes without closing the caller connection, then reports closed-channel operations", async () => {
      const connection = await amqplib.connect(serviceUrl("RABBITMQ"), { timeout: 1_000 });
      const adapter = amqplibAdapter({ connection });
      try {
        for (let index = 0; index < 5; index++) {
          expect((await adapter.check()).status).toBe("ok");
        }
        const channel = await connection.createChannel();
        try {
          await channel.assertQueue("", { exclusive: true, autoDelete: true });
        } finally {
          await channel.close();
        }
      } finally {
        await connection.close();
      }
      const result = await adapter.check();
      expect(result.status).toBe("fail");
      expect(result.error).toBeTruthy();
    }, 15_000);

    it("keeps a caller-owned manager usable and reports its disconnection", async () => {
      const connection = new AmqpConnectionManagerClass([serviceUrl("RABBITMQ")], {
        connectionOptions: { timeout: 1_000 },
        reconnectTimeInSeconds: 1,
      });
      const adapter = amqpConnectionManagerAdapter({ connection });
      try {
        await connection.connect({ timeout: 2_000 });
        for (let index = 0; index < 5; index++) {
          expect((await adapter.check()).status).toBe("ok");
        }
        const channel = connection.createChannel();
        try {
          await channel.waitForConnect();
          expect(connection.isConnected()).toBe(true);
        } finally {
          await channel.close();
        }
      } finally {
        await connection.close();
      }
      expect((await adapter.check()).status).toBe("fail");
    }, 15_000);

    it("bounds refused handshakes and stops manager reconnect timers on cleanup", async () => {
      const url = `amqp://127.0.0.1:${await refusedPort()}`;
      // URL mode can only fail here; it never acquires a library-owned connection.
      const adapter = amqplibAdapter({ url, socketOptions: { timeout: 1_000 } });
      for (let index = 0; index < 3; index++) {
        const result = await adapter.check();
        expect(result.status).toBe("fail");
        expect(result.error).toBeTruthy();
      }
      const connection = new AmqpConnectionManagerClass([url], {
        connectionOptions: { timeout: 1_000 },
        reconnectTimeInSeconds: 1,
      });
      try {
        await expect(connection.connect({ timeout: 1_000 })).rejects.toThrow();
        const managed = amqpConnectionManagerAdapter({ connection });
        for (let index = 0; index < 3; index++) {
          expect((await managed.check()).status).toBe("fail");
        }
      } finally {
        await connection.close();
      }
    }, 15_000);
  },
);
