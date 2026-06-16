import { describe, expect, test } from "vite-plus/test";
import type { Kafka } from "kafkajs";
import type { Producer as RdProducer } from "node-rdkafka";
import { kafkajsAdapter, nodeRdKafkaAdapter } from "../src/index.ts";

describe("package entry (src/index.ts)", () => {
  test("re-exports both kafka adapters", async () => {
    const entry = await import("../src/index.ts");
    const kafkajsMod = await import("../src/kafkajs.ts");
    const nodeRdKafkaMod = await import("../src/node-rdkafka.ts");

    expect(entry.kafkajsAdapter).toBe(kafkajsMod.kafkajsAdapter);
    expect(entry.nodeRdKafkaAdapter).toBe(nodeRdKafkaMod.nodeRdKafkaAdapter);
  });

  test("adapters are usable from the barrel with mocks", async () => {
    const kafkajs = kafkajsAdapter({
      client: {
        admin: () => ({
          connect: async () => undefined,
          describeCluster: async () => ({ brokers: [] }),
          disconnect: async () => undefined,
        }),
      } as unknown as Kafka,
    });
    expect((await kafkajs.check()).status).toBe("ok");

    const nodeRdKafka = nodeRdKafkaAdapter({
      client: {
        isConnected: () => true,
        getMetadata: (_opts: object, cb: (err?: { message: string }) => void) => cb(),
        connect: () => undefined,
      } as unknown as RdProducer,
    });
    expect((await nodeRdKafka.check()).status).toBe("ok");
  });
});
