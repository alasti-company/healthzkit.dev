import { afterEach, expect, test, vi } from "vite-plus/test";
import { GetQueueAttributesCommand, type SQSClient } from "@aws-sdk/client-sqs";
import { sqsV3Adapter } from "../src/index.ts";

const queueUrl = "https://sqs.us-east-1.amazonaws.com/123456789012/jobs";
const Attributes = {
  ApproximateNumberOfMessages: "10",
  ApproximateNumberOfMessagesNotVisible: "2",
  ApproximateNumberOfMessagesDelayed: "1",
};
function fixture() {
  const send = vi.fn().mockResolvedValue({ Attributes });
  const destroy = vi.fn();
  const client = { send, destroy } as unknown as SQSClient;
  return { send, destroy, client };
}
afterEach(() => {
  vi.doUnmock("@aws-sdk/client-sqs");
  vi.resetModules();
});

test("requests only queue counts, forwards signal, and merges metadata", async () => {
  const { client, send, destroy } = fixture();
  const metadata = vi.fn().mockResolvedValue({ custom: true });
  const adapter = sqsV3Adapter({ client, queueUrl, metadata });
  const signal = new AbortController().signal;
  expect(await adapter.check({ signal })).toEqual({
    status: "ok",
    metadata: {
      latencyMs: expect.any(Number),
      approximateBacklog: { visible: 10, notVisible: 2, delayed: 1 },
      custom: true,
    },
  });
  expect(send).toHaveBeenCalledOnce();
  expect(send.mock.calls[0]![0]).toBeInstanceOf(GetQueueAttributesCommand);
  expect(send.mock.calls[0]![0].input).toEqual({
    QueueUrl: queueUrl,
    AttributeNames: Object.keys(Attributes),
  });
  expect(send.mock.calls[0]![1]).toEqual({ abortSignal: signal });
  expect(metadata).toHaveBeenCalledWith(client);
  await adapter.dispose!();
  expect(destroy).not.toHaveBeenCalled();
});

test.each([
  ["visible", 9],
  ["notVisible", 1],
  ["delayed", 0],
] as const)("degrades only for an exceeded %s threshold", async (key, limit) => {
  const { client } = fixture();
  expect(
    (await sqsV3Adapter({ client, queueUrl, backlogThresholds: { [key]: limit } }).check()).status,
  ).toBe("degraded");
  expect(
    (await sqsV3Adapter({ client, queueUrl, backlogThresholds: { [key]: limit + 1 } }).check())
      .status,
  ).toBe("ok");
});

test.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  "rejects invalid threshold %s",
  (limit) => {
    expect(() => sqsV3Adapter({ queueUrl, backlogThresholds: { visible: limit } })).toThrow(
      RangeError,
    );
  },
);

test("requires a nonempty queue URL", () => {
  expect(() => sqsV3Adapter({ queueUrl: " " })).toThrow(TypeError);
});

test.each([undefined, "", "-1", "1.5", "NaN", "9007199254740992"])(
  "fails for missing/invalid count %s rather than assuming zero",
  async (value) => {
    const { client, send } = fixture();
    send.mockResolvedValue({ Attributes: { ...Attributes, ApproximateNumberOfMessages: value } });
    expect(
      await sqsV3Adapter({ client, queueUrl, backlogThresholds: { visible: 0 } }).check(),
    ).toMatchObject({ status: "fail", error: expect.any(Error) });
  },
);

test("SDK and metadata failures return fail", async () => {
  const { client, send } = fixture();
  const error = new Error("AccessDenied");
  send.mockRejectedValueOnce(error);
  expect(await sqsV3Adapter({ client, queueUrl }).check()).toMatchObject({ status: "fail", error });
  expect(
    await sqsV3Adapter({
      client,
      queueUrl,
      metadata: () => {
        throw error;
      },
    }).check(),
  ).toMatchObject({ status: "fail", error });
});

test("pre-aborted checks skip SDK work", async () => {
  const { client, send } = fixture();
  const signal = AbortSignal.abort(new Error("canceled"));
  expect(await sqsV3Adapter({ client, queueUrl }).check({ signal })).toMatchObject({
    status: "fail",
    error: signal.reason,
  });
  expect(send).not.toHaveBeenCalled();
});

test("in-flight abort preserves reason, skips metadata, and does not destroy client", async () => {
  const { client, send, destroy } = fixture();
  const metadata = vi.fn();
  send.mockImplementation(
    (_command: unknown, { abortSignal }: { abortSignal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        abortSignal.addEventListener("abort", () => reject(new Error("SDK abort")), { once: true });
      }),
  );
  const adapter = sqsV3Adapter({ client, queueUrl, metadata });
  const controller = new AbortController();
  const pending = adapter.check({ signal: controller.signal });
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
  controller.abort(new Error("deadline"));
  expect(await pending).toMatchObject({ status: "fail", error: controller.signal.reason });
  expect(metadata).not.toHaveBeenCalled();
  expect(destroy).not.toHaveBeenCalled();
});

test("owned client initializes once and disposal waits for active checks", async () => {
  const { client, send, destroy } = fixture();
  let finish!: (value: unknown) => void;
  send.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const construct = vi.fn(function () {
    return client;
  });
  vi.doMock("@aws-sdk/client-sqs", () => ({
    SQSClient: construct,
    GetQueueAttributesCommand: class {},
  }));
  const adapter = sqsV3Adapter({ queueUrl, config: { region: "us-east-1" } });
  const first = adapter.check();
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
  const closing = adapter.dispose!();
  expect(adapter.dispose!()).toBe(closing);
  expect(destroy).not.toHaveBeenCalled();
  finish({ Attributes });
  expect((await first).status).toBe("ok");
  await closing;
  expect(construct).toHaveBeenCalledExactlyOnceWith({ region: "us-east-1" });
  expect(destroy).toHaveBeenCalledOnce();
  expect((await adapter.check()).status).toBe("fail");
});

test("unused owned clients are never constructed on disposal", async () => {
  const construct = vi.fn();
  vi.doMock("@aws-sdk/client-sqs", () => ({ SQSClient: construct }));
  await sqsV3Adapter({ queueUrl }).dispose!();
  expect(construct).not.toHaveBeenCalled();
});

// Use the real SDK to verify ownership through its destroy() implementation.
test.each([false, true])("configured handler ownership (supplied client=%s)", async (supplied) => {
  vi.doUnmock("@aws-sdk/client-sqs");
  vi.resetModules();
  const { SQSClient } = await import("@aws-sdk/client-sqs");
  const destroy = vi.fn();
  const handler = { handle: vi.fn().mockRejectedValue(new Error("offline")), destroy };
  const config = {
    region: "us-east-1",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
    maxAttempts: 1,
    requestHandler: handler,
  };
  const client = new SQSClient(config);
  const adapter = sqsV3Adapter(supplied ? { client, queueUrl } : { config, queueUrl });
  expect((await adapter.check()).status).toBe("fail");
  await adapter.dispose!();
  expect(destroy).toHaveBeenCalledTimes(supplied ? 0 : 1);
  if (supplied) client.destroy();
});

test("concurrent owned checks share lazy initialization and retry failed construction", async () => {
  const { client, destroy } = fixture();
  const construct = vi
    .fn()
    .mockImplementationOnce(function () {
      throw new Error("configuration unavailable");
    })
    .mockImplementation(function () {
      return client;
    });
  vi.doMock("@aws-sdk/client-sqs", () => ({
    SQSClient: construct,
    GetQueueAttributesCommand: class {},
  }));
  const adapter = sqsV3Adapter({ queueUrl });
  expect(
    (await Promise.all([adapter.check(), adapter.check()])).map((result) => result.status),
  ).toEqual(["fail", "fail"]);
  expect(construct).toHaveBeenCalledOnce();
  expect(
    (await Promise.all([adapter.check(), adapter.check()])).map((result) => result.status),
  ).toEqual(["ok", "ok"]);
  expect(construct).toHaveBeenCalledTimes(2);
  await adapter.dispose!();
  expect(destroy).toHaveBeenCalledOnce();
});
