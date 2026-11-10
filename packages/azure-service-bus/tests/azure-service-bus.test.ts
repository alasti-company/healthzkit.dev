import type { ServiceBusAdministrationClient } from "@azure/service-bus";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { azureServiceBusAdapter } from "../src/index.ts";

const properties = {
  activeMessageCount: 10,
  deadLetterMessageCount: 2,
  totalMessageCount: 15,
  scheduledMessageCount: 3,
};
function mockClient() {
  const getQueueRuntimeProperties = vi.fn(
    async (_queue: string, _options?: { abortSignal?: AbortSignal }) => properties,
  );
  const close = vi.fn();
  return {
    client: { getQueueRuntimeProperties, close } as unknown as ServiceBusAdministrationClient,
    getQueueRuntimeProperties,
    close,
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("@azure/service-bus");
  vi.resetModules();
});

test("barrel and subpath expose the same factory", async () => {
  expect((await import("../src/azure-service-bus.ts")).azureServiceBusAdapter).toBe(
    azureServiceBusAdapter,
  );
});
test("reads only the configured queue, reports counts and leaves supplied clients owned by the app", async () => {
  const { client, getQueueRuntimeProperties, close } = mockClient();
  const adapter = azureServiceBusAdapter({ client, queueName: "orders" });
  expect(await adapter.check()).toMatchObject({
    status: "ok",
    metadata: { ...properties, latencyMs: expect.any(Number) },
  });
  await adapter.check();
  expect(getQueueRuntimeProperties).toHaveBeenCalledTimes(2);
  expect(getQueueRuntimeProperties).toHaveBeenCalledWith("orders", {
    abortSignal: expect.any(AbortSignal),
  });
  expect(close).not.toHaveBeenCalled();
  expect("dispose" in adapter).toBe(false);
});
test.each([
  [{}, "ok"],
  [{ maxActiveMessageCount: 10, maxDeadLetterMessageCount: 2 }, "ok"],
  [{ maxActiveMessageCount: 9 }, "degraded"],
  [{ maxDeadLetterMessageCount: 0 }, "degraded"],
])("thresholds are opt-in, inclusive, and independent: %j", async (limits, status) => {
  expect(
    (await azureServiceBusAdapter({ ...mockClient(), queueName: "orders", ...limits }).check())
      .status,
  ).toBe(status);
});
test.each(["Unauthorized", "MessagingEntityNotFound", "network failure"])(
  "returns fail for %s",
  async (message) => {
    const { client, getQueueRuntimeProperties } = mockClient();
    const error = new Error(message);
    getQueueRuntimeProperties.mockRejectedValueOnce(error);
    expect(await azureServiceBusAdapter({ client, queueName: "orders" }).check()).toMatchObject({
      status: "fail",
      error,
    });
  },
);
test("already aborted checks never call the client", async () => {
  const { client, getQueueRuntimeProperties } = mockClient();
  expect(
    (
      await azureServiceBusAdapter({ client, queueName: "orders" }).check({
        signal: AbortSignal.abort(),
      })
    ).status,
  ).toBe("fail");
  expect(getQueueRuntimeProperties).not.toHaveBeenCalled();
});
test.each(["deadline", "context"])(
  "forwards %s cancellation and clears the deadline timer",
  async (source) => {
    vi.useFakeTimers();
    const { client, getQueueRuntimeProperties } = mockClient();
    getQueueRuntimeProperties.mockImplementationOnce(
      async (_queue, options) =>
        new Promise((_resolve, reject) => {
          options!.abortSignal!.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    );
    const controller = new AbortController();
    const result = azureServiceBusAdapter({
      client,
      queueName: "orders",
      operationTimeoutMs: 50,
    }).check({ signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    if (source === "context") controller.abort();
    else await vi.advanceTimersByTimeAsync(50);
    expect((await result).status).toBe("fail");
    expect(vi.getTimerCount()).toBe(0);
  },
);
test("lazily constructs one owned client for concurrent checks with finite retry defaults", async () => {
  const { client, getQueueRuntimeProperties } = mockClient();
  const construct = vi.fn(function () {
    return client;
  });
  vi.doMock("@azure/service-bus", () => ({ ServiceBusAdministrationClient: construct }));
  const adapter = azureServiceBusAdapter({ connectionString: "secret", queueName: "orders" });
  expect(construct).not.toHaveBeenCalled();
  await Promise.all([adapter.check(), adapter.check()]);
  expect(construct).toHaveBeenCalledExactlyOnceWith("secret", { retryOptions: { maxRetries: 0 } });
  expect(getQueueRuntimeProperties).toHaveBeenCalledTimes(2);
});
test("retries failed construction and forwards administration client options", async () => {
  const { client } = mockClient();
  const construct = vi
    .fn(function () {
      return client;
    })
    .mockImplementationOnce(() => {
      throw new Error("bad config");
    });
  vi.doMock("@azure/service-bus", () => ({ ServiceBusAdministrationClient: construct }));
  const adapter = azureServiceBusAdapter({
    connectionString: "secret",
    queueName: "orders",
    clientOptions: { retryOptions: { maxRetries: 1 } },
  });
  expect((await adapter.check()).status).toBe("fail");
  expect((await adapter.check()).status).toBe("ok");
  expect(construct).toHaveBeenLastCalledWith("secret", { retryOptions: { maxRetries: 1 } });
});
test.each([0, -1, Infinity, NaN, 1.5, 2_147_483_648])(
  "rejects invalid operation timeout %s",
  (operationTimeoutMs) => {
    expect(() =>
      azureServiceBusAdapter({ ...mockClient(), queueName: "orders", operationTimeoutMs }),
    ).toThrow(RangeError);
  },
);
test.each([-1, Infinity, NaN, 1.5])("rejects invalid threshold %s", (value) => {
  for (const key of ["maxActiveMessageCount", "maxDeadLetterMessageCount"]) {
    expect(() =>
      azureServiceBusAdapter({ ...mockClient(), queueName: "orders", [key]: value }),
    ).toThrow(RangeError);
  }
});
test("rejects empty queue names", () => {
  expect(() => azureServiceBusAdapter({ ...mockClient(), queueName: " " })).toThrow(TypeError);
});
