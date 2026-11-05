import { Kafka, logLevel } from "kafkajs";
import { describe, expect, it } from "vite-plus/test";
import { refusedPort, serviceUrl } from "../../../tools/shared/test-support/integration.ts";
import { kafkajsAdapter } from "../src/kafkajs.ts";

function client(broker: string): Kafka {
  return new Kafka({
    brokers: [broker],
    clientId: "healthzkit-integration",
    connectionTimeout: 1_000,
    authenticationTimeout: 1_000,
    requestTimeout: 1_000,
    enforceRequestTimeout: true,
    retry: { retries: 0 },
    logLevel: logLevel.NOTHING,
  });
}

describe.skipIf(process.env.HEALTHZKIT_INTEGRATION !== "1")(
  "kafkajs real-service integration",
  () => {
    it("repeats probes, handles a broker operation error, and preserves caller use", async () => {
      const kafka = client(serviceUrl("KAFKA"));
      const owner = kafka.admin();
      try {
        await owner.connect();
        const adapter = kafkajsAdapter({ client: kafka });
        for (let index = 0; index < 5; index++) {
          expect((await adapter.check()).status).toBe("ok");
        }
        const failing = kafkajsAdapter({
          client: kafka,
          metadata: async () => {
            // Empty topic names are rejected by the broker; no application topics are changed.
            await owner.createTopics({ topics: [{ topic: "" }], timeout: 1_000 });
            return {};
          },
        });
        const result = await failing.check();
        expect(result.status).toBe("fail");
        expect(result.error).toMatchObject({
          errors: [{ type: "INVALID_TOPIC_EXCEPTION", topic: "" }],
        });
        expect((await adapter.check()).status).toBe("ok");
        expect((await owner.describeCluster()).brokers.length).toBeGreaterThan(0);
      } finally {
        await owner.disconnect();
      }
    }, 15_000);

    it("bounds retries on refused connections", async () => {
      const kafka = client(`127.0.0.1:${await refusedPort()}`);
      const adapter = kafkajsAdapter({ client: kafka });
      // Each probe owns a temporary admin; the adapter disconnects it even on failure.
      for (let index = 0; index < 3; index++) {
        const result = await adapter.check();
        expect(result.status).toBe("fail");
        expect(result.error).toBeTruthy();
      }
    }, 15_000);
  },
);
