import { describe, expect, test, vi } from "vite-plus/test";
import { createHealthKit } from "healthzkit";
import { s3V2Adapter } from "../src/v2.ts";
import { s3V3Adapter } from "../src/v3.ts";

function setup(version: "v2" | "v3", settleOnAbort = true) {
  let signal: AbortSignal | undefined;
  let rejectOperation: (error: Error) => void = () => {};
  const abortError = new Error("SDK request aborted");
  const abort = vi.fn(() => {
    if (settleOnAbort) rejectOperation(abortError);
  });
  const operation = vi.fn<() => Promise<unknown>>().mockResolvedValue({ Buckets: [] });
  const send = vi.fn((_command: unknown, options?: { abortSignal?: AbortSignal }) => {
    signal = options?.abortSignal;
    const pending = operation();
    signal?.addEventListener("abort", abort, { once: true });
    return pending.finally(() => signal?.removeEventListener("abort", abort));
  });
  const request = vi.fn((...args: unknown[]) => {
    const callback = args.at(-1) as (error: Error | null, data?: unknown) => void;
    void operation().then(
      (data) => callback(null, data),
      (error: Error) => callback(error),
    );
    return { abort };
  });
  const destroy = vi.fn();
  const client = { send, listBuckets: request, destroy };
  const metadata = vi.fn(() => ({ fresh: true }));
  const adapter =
    version === "v3"
      ? s3V3Adapter({ client: client as never, metadata })
      : s3V2Adapter({ client: client as never, metadata });
  return {
    adapter,
    operation,
    abort,
    destroy,
    metadata,
    get signal() {
      return signal;
    },
    hang() {
      operation.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectOperation = reject;
          }),
      );
    },
    settle() {
      rejectOperation(abortError);
    },
  };
}

describe.each(["v2", "v3"] as const)("AWS %s cancellation", (version) => {
  test("preserves the context reason and skips metadata without destroying the client", async () => {
    const state = setup(version);
    // Warm the lazy SDK import before starting the pending request.
    await state.adapter.check();
    state.metadata.mockClear();
    state.hang();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const pending = state.adapter.check({ signal: controller.signal });
    await vi.waitFor(() => expect(state.operation).toHaveBeenCalledTimes(2));
    if (version === "v3") expect(state.signal).toBe(controller.signal);
    const reason = new Error("caller canceled");
    controller.abort(reason);
    expect(await pending).toMatchObject({ status: "fail", error: reason });
    expect(state.abort).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(state.metadata).not.toHaveBeenCalled();
    expect(state.destroy).not.toHaveBeenCalled();
    expect((await state.adapter.check()).status).toBe("ok");
  });

  test("does not start SDK work for an already aborted context", async () => {
    const state = setup(version);
    const controller = new AbortController();
    const reason = new Error("already canceled");
    controller.abort(reason);
    expect(await state.adapter.check({ signal: controller.signal })).toMatchObject({
      status: "fail",
      error: reason,
    });
    expect(state.operation).not.toHaveBeenCalled();
    expect(state.destroy).not.toHaveBeenCalled();
  });

  test.each([true, false])(
    "deadline recovery waits for SDK settlement (prompt: %s)",
    async (prompt) => {
      const state = setup(version, prompt);
      await state.adapter.check();
      state.operation.mockClear();
      state.hang();
      vi.useFakeTimers();
      const kit = createHealthKit({
        checks: [
          {
            name: "aws",
            type: ["readiness", "liveness"],
            timeout: 25,
            adapter: state.adapter,
          },
        ],
      });
      try {
        const first = kit.handleReadiness();
        const second = kit.handleLiveness();
        await vi.advanceTimersByTimeAsync(25);
        for (const response of await Promise.all([first, second])) {
          expect(response.status).toBe(503);
          expect(JSON.parse(response.body).checks.aws.error).toBe(
            'Check "aws" timed out after 25ms',
          );
        }
        expect(state.abort).toHaveBeenCalledOnce();
        expect(state.operation).toHaveBeenCalledOnce();
        if (!prompt) {
          for (let i = 0; i < 3; i++) expect((await kit.handleReadiness()).status).toBe(503);
          expect(state.operation).toHaveBeenCalledOnce();
          state.settle();
          await vi.advanceTimersByTimeAsync(0);
        }
        const fresh = await kit.handleReadiness();
        expect(fresh.status).toBe(200);
        expect(JSON.parse(fresh.body).checks.aws.metadata.fresh).toBe(true);
        expect(state.operation).toHaveBeenCalledTimes(2);
        expect(state.destroy).not.toHaveBeenCalled();
      } finally {
        kit.stop();
        vi.useRealTimers();
      }
    },
  );

  if (version === "v2") {
    test.each(["success", "failure"])("removes request abort listener after %s", async (result) => {
      const state = setup(version);
      if (result === "failure") state.operation.mockRejectedValueOnce(new Error("AccessDenied"));
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      const response = await state.adapter.check({ signal: controller.signal });
      expect(response.status).toBe(result === "success" ? "ok" : "fail");
      if (result === "failure") expect((response.error as Error).message).toBe("AccessDenied");
      controller.abort();
      expect(state.abort).not.toHaveBeenCalled();
      expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    });
  }
});
