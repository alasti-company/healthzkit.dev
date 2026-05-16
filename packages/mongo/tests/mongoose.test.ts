import { describe, expect, test, vi } from "vite-plus/test";
import { mongooseAdapter } from "../src/mongoose.ts";

function mockDb(command = vi.fn().mockResolvedValue({ ok: 1 })) {
  return { admin: () => ({ command }) };
}

describe("mongooseAdapter", () => {
  test("fails when neither connection nor connectionString is provided", async () => {
    const adapter = mongooseAdapter({} as never);
    const result = await adapter.check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "mongoose adapter requires connection or connectionString",
    );
  });

  test("fails when connectionString is empty", async () => {
    const adapter = mongooseAdapter({ connectionString: "" });
    const result = await adapter.check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe(
      "mongoose adapter requires connection or connectionString",
    );
  });

  test("pings via mongoose.db when connection is a Mongoose instance", async () => {
    const command = vi.fn().mockResolvedValue({ ok: 1 });
    const connection = {
      readyState: 1,
      db: mockDb(command),
    } as never;

    const result = await mongooseAdapter({ connection }).check();

    expect(result.status).toBe("ok");
    expect(command).toHaveBeenCalledWith({ ping: 1 });
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("pings via connection.db for a mongoose Connection", async () => {
    const command = vi.fn().mockResolvedValue({ ok: 1 });
    const connection = {
      readyState: 1,
      connection: { db: mockDb(command) },
    } as never;

    const result = await mongooseAdapter({ connection }).check();

    expect(result.status).toBe("ok");
    expect(command).toHaveBeenCalledWith({ ping: 1 });
  });

  test("awaits asPromise when readyState is not connected", async () => {
    const command = vi.fn().mockResolvedValue({ ok: 1 });
    const asPromise = vi.fn().mockResolvedValue(undefined);
    const connection = {
      readyState: 0,
      asPromise,
      db: mockDb(command),
    } as never;

    const result = await mongooseAdapter({ connection }).check();

    expect(asPromise).toHaveBeenCalledOnce();
    expect(result.status).toBe("ok");
  });

  test("returns fail when ping rejects", async () => {
    const command = vi.fn().mockRejectedValue(new Error("topology closed"));
    const connection = {
      readyState: 1,
      db: mockDb(command),
    } as never;

    const result = await mongooseAdapter({ connection }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("topology closed");
  });

  test("includes metadata from optional metadata hook", async () => {
    const connection = {
      readyState: 1,
      db: mockDb(),
    } as never;

    const adapter = mongooseAdapter({
      connection,
      metadata: async (c) => {
        expect(c).toBe(connection);
        return { replicas: 3 };
      },
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({ replicas: 3, latencyMs: expect.any(Number) });
  });

  test("connects once via connectionString and reuses mongoose", async () => {
    const command = vi.fn().mockResolvedValue({ ok: 1 });
    const connect = vi.fn().mockResolvedValue(undefined);
    const mongoose = {
      connect,
      db: mockDb(command),
    };

    vi.doMock("mongoose", () => ({ default: mongoose }));

    const { mongooseAdapter: adapterFactory } = await import("../src/mongoose.ts");
    const adapter = adapterFactory({
      connectionString: "mongodb://localhost:27017",
      mongooseOptions: { serverSelectionTimeoutMS: 50 },
    });

    await adapter.check();
    await adapter.check();

    expect(connect).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledWith("mongodb://localhost:27017", {
      serverSelectionTimeoutMS: 50,
    });
    expect(command).toHaveBeenCalledTimes(2);

    vi.doUnmock("mongoose");
  });

  test("reuses a single mongoose connect across concurrent checks", async () => {
    let connectCount = 0;
    const connect = vi.fn(async () => {
      connectCount += 1;
    });
    const mongoose = {
      connect,
      db: mockDb(),
    };

    vi.doMock("mongoose", () => ({ default: mongoose }));

    const { mongooseAdapter: adapterFactory } = await import("../src/mongoose.ts");
    const adapter = adapterFactory({
      connectionString: "mongodb://localhost:27017",
      mongooseOptions: { serverSelectionTimeoutMS: 100 },
    });

    await Promise.all([adapter.check(), adapter.check()]);

    expect(connectCount).toBe(1);
    expect(connect).toHaveBeenCalledWith("mongodb://localhost:27017", {
      serverSelectionTimeoutMS: 100,
    });

    vi.doUnmock("mongoose");
  });
});
