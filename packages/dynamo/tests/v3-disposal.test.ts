import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { dynamoV3Adapter } from "../src/v3.ts";

afterEach(() => {
  vi.doUnmock("@aws-sdk/client-dynamodb");
  vi.resetModules();
});

describe("dynamoV3Adapter disposal", () => {
  function fixture() {
    const client = { send: vi.fn().mockResolvedValue({}) };
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const resource = { ...client, destroy: cleanup };
    const construct = vi.fn(function () {
      return resource;
    });
    vi.doMock("@aws-sdk/client-dynamodb", () => ({
      DynamoDBClient: construct,
      ListTablesCommand: class {},
    }));
    return { resource, cleanup, construct };
  }

  test("disposes one lazily owned resource after concurrent checks, exactly once", async () => {
    const { cleanup, construct } = fixture();
    const adapter = dynamoV3Adapter({ config: {} });
    const results = await Promise.all([adapter.check(), adapter.check()]);
    expect(results.map((result) => result.status)).toEqual(["ok", "ok"]);
    const closing = adapter.dispose!();
    expect(adapter.dispose!()).toBe(closing);
    await closing;
    await adapter.dispose!();
    expect(construct).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
    expect((await adapter.check()).status).toBe("fail");
  });

  test("never cleans up a supplied resource", async () => {
    const { resource, cleanup, construct } = fixture();
    const adapter = dynamoV3Adapter({ client: resource } as never);
    expect((await adapter.check()).status).toBe("ok");
    await adapter.dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  test("does not initialize an unused resource during disposal", async () => {
    const { cleanup, construct } = fixture();
    await dynamoV3Adapter({ config: {} }).dispose!();
    expect(construct).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });
});
