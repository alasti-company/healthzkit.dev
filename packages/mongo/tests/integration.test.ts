import { MongoClient } from "mongodb";
import mongoose from "mongoose";
import { describe, expect, it } from "vite-plus/test";
import { refusedPort, serviceUrl } from "../../../tools/shared/test-support/integration.ts";
import { mongodbAdapter } from "../src/mongodb.ts";
import { mongooseAdapter } from "../src/mongoose.ts";

const timeouts = {
  serverSelectionTimeoutMS: 1_000,
  connectTimeoutMS: 1_000,
  socketTimeoutMS: 1_000,
  waitQueueTimeoutMS: 1_000,
  maxPoolSize: 1,
  retryReads: false,
  retryWrites: false,
};

describe.skipIf(process.env.HEALTHZKIT_INTEGRATION !== "1")(
  "MongoDB real-service integration",
  () => {
    it("reuses a caller-owned MongoClient after probes and a server command error", async () => {
      const client = new MongoClient(serviceUrl("MONGO"), timeouts);
      try {
        const adapter = mongodbAdapter({ client });
        for (let index = 0; index < 5; index++) {
          expect((await adapter.check()).status).toBe("ok");
        }
        const failing = mongodbAdapter({
          client,
          metadata: async (resolved) => {
            await resolved
              .db("admin")
              .command({ healthzkitMissingCommand: 1 }, { timeoutMS: 1_000 });
            return {};
          },
        });
        const result = await failing.check();
        expect(result.status).toBe("fail");
        expect(result.error).toMatchObject({ code: 59 });
        expect((await adapter.check()).status).toBe("ok");
        await client.db("admin").command({ ping: 1 }, { timeoutMS: 1_000 });
      } finally {
        await client.close();
      }
    }, 15_000);

    it("preserves an isolated Mongoose connection after probes and a server command error", async () => {
      const connection = mongoose.createConnection();
      try {
        await connection.openUri(serviceUrl("MONGO"), timeouts);
        const adapter = mongooseAdapter({ connection });
        for (let index = 0; index < 5; index++) {
          expect((await adapter.check()).status).toBe("ok");
        }
        const result = await mongooseAdapter({
          connection,
          metadata: async () => {
            await connection.db!.command({ healthzkitMissingCommand: 1 }, { timeoutMS: 1_000 });
            return {};
          },
        }).check();
        expect(result.status).toBe("fail");
        expect(result.error).toMatchObject({ code: 59 });
        expect((await adapter.check()).status).toBe("ok");
        await connection.db!.command({ ping: 1 }, { timeoutMS: 1_000 });
        expect(connection.readyState).toBe(1);
      } finally {
        await connection.close();
      }
      expect(connection.readyState).toBe(0);
    }, 15_000);

    it("reports refused connections with bounded server selection for both drivers", async () => {
      const url = `mongodb://127.0.0.1:${await refusedPort()}/healthzkit`;
      const client = new MongoClient(url, timeouts);
      const connection = mongoose.createConnection();
      try {
        const adapter = mongodbAdapter({ client });
        for (let index = 0; index < 3; index++) {
          const result = await adapter.check();
          expect(result.status).toBe("fail");
          expect(result.error).toBeTruthy();
        }
        // Attach the rejection handler before passing the connecting connection to the adapter.
        const opening = connection.openUri(url, timeouts).catch(() => undefined);
        const result = await mongooseAdapter({ connection }).check();
        expect(result.status).toBe("fail");
        expect(result.error).toBeTruthy();
        await opening;
      } finally {
        await client.close();
        await connection.close();
      }
    }, 15_000);
  },
);
