import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import { createHealthKit } from "healthzkit";
import { describe, expect, it } from "vite-plus/test";
import { refusedPort, serviceUrl } from "../../../tools/shared/test-support/integration.ts";
import { bullmqAdapter } from "../src/bullmq.ts";

function queue(host: string, port: number) {
  const client = new Queue(`healthzkit-${randomUUID()}`, {
    skipMetasUpdate: true,
    connection: {
      host,
      port,
      connectTimeout: 1_000,
      commandTimeout: 1_000,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
      enableOfflineQueue: false,
    },
  });
  client.on("error", () => {});
  return client;
}

describe.skipIf(process.env.HEALTHZKIT_INTEGRATION !== "1")(
  "BullMQ real-service integration",
  () => {
    it("reads empty queue counts repeatedly, preserves owner access after kit close, and reports a closed queue", async () => {
      const url = new URL(serviceUrl("REDIS"));
      const client = queue(url.hostname, Number(url.port || 6379));
      const adapter = bullmqAdapter({ queue: client, thresholds: { waiting: 0, paused: 0 } });
      const kit = createHealthKit({ checks: [{ name: "queue", type: ["readiness"], adapter }] });
      try {
        await client.waitUntilReady();
        for (let index = 0; index < 5; index++) {
          expect(await adapter.check()).toMatchObject({
            status: "ok",
            metadata: {
              counts: { waiting: 0, paused: 0, prioritized: 0, delayed: 0 },
            },
          });
        }
        await kit.close();
        expect(await client.getJobCounts("waiting")).toMatchObject({ waiting: 0 });
        await client.close();
        expect((await adapter.check()).status).toBe("fail");
      } finally {
        await kit.close();
        await client.close();
      }
    }, 15_000);

    it("reads real backlog states and applies thresholds before and after pausing", async () => {
      const url = new URL(serviceUrl("REDIS"));
      const client = queue(url.hostname, Number(url.port || 6379));
      try {
        await client.waitUntilReady();
        await client.add("waiting", {});
        await client.add("prioritized", {}, { priority: 1 });
        await client.add("delayed", {}, { delay: 3_600_000 });
        const adapter = bullmqAdapter({
          queue: client,
          thresholds: { waiting: 1, paused: 0, prioritized: 1, delayed: 1 },
        });
        expect(await adapter.check()).toMatchObject({
          status: "ok",
          metadata: { counts: { waiting: 1, paused: 0, prioritized: 1, delayed: 1 }, exceeded: [] },
        });
        for (const state of ["waiting", "prioritized", "delayed"] as const) {
          expect(
            await bullmqAdapter({ queue: client, thresholds: { [state]: 0 } }).check(),
          ).toMatchObject({ status: "degraded", metadata: { exceeded: [state] } });
        }
        await client.pause();
        expect(await adapter.check()).toMatchObject({
          status: "degraded",
          metadata: {
            counts: { waiting: 0, paused: 1, prioritized: 1, delayed: 1 },
            exceeded: ["paused"],
          },
        });
        expect(
          await bullmqAdapter({ queue: client, thresholds: { paused: 1 } }).check(),
        ).toMatchObject({ status: "ok" });
      } finally {
        try {
          await client.obliterate({ force: true });
        } finally {
          await client.close();
        }
      }
    }, 15_000);

    it("bounds refused connections without retrying forever", async () => {
      const client = queue("127.0.0.1", await refusedPort());
      try {
        const adapter = bullmqAdapter({ queue: client });
        for (let index = 0; index < 3; index++) {
          expect((await adapter.check()).status).toBe("fail");
        }
      } finally {
        await client.close();
      }
    }, 15_000);
  },
);
