import { describe, expect, test, vi } from "vite-plus/test";
import { createHealthKit } from "healthzkit";
import { elasticsearchAdapter } from "../src/elasticsearch.ts";

function setup(settleOnAbort = true) {
  let signal: AbortSignal | undefined;
  let rejectOperation: (error: Error) => void = () => {};
  const abortError = new Error("SDK request aborted");
  const abort = vi.fn(() => {
    if (settleOnAbort) rejectOperation(abortError);
  });
  const operation = vi.fn<() => Promise<unknown>>().mockResolvedValue({ status: "green" });
  const send = vi.fn((_command: unknown, options?: { signal?: AbortSignal }) => {
    signal = options?.signal;
    const pending = operation();
    signal?.addEventListener("abort", abort, { once: true });
    return pending.finally(() => signal?.removeEventListener("abort", abort));
  });
  const destroy = vi.fn();
  const client = { cluster: { health: send }, close: destroy };
  const metadata = vi.fn(() => ({ fresh: true }));
  const adapter = elasticsearchAdapter({ client: client as never, metadata });
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

describe("Elasticsearch cancellation", () => {
  test("preserves the context reason and skips metadata without destroying the client", async () => {
    const state = setup();
    // Warm the lazy SDK import before starting the pending request.
    await state.adapter.check();
    state.metadata.mockClear();
    state.hang();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const pending = state.adapter.check({ signal: controller.signal });
    await vi.waitFor(() => expect(state.operation).toHaveBeenCalledTimes(2));
    expect(state.signal).toBe(controller.signal);
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
    const state = setup();
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
      const state = setup(prompt);
      await state.adapter.check();
      state.operation.mockClear();
      state.hang();
      vi.useFakeTimers();
      const kit = createHealthKit({
        checks: [
          {
            name: "search",
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
          expect(JSON.parse(response.body).checks.search.error).toBe(
            'Check "search" timed out after 25ms',
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
        expect(JSON.parse(fresh.body).checks.search.metadata.fresh).toBe(true);
        expect(state.operation).toHaveBeenCalledTimes(2);
        expect(state.destroy).not.toHaveBeenCalled();
      } finally {
        kit.stop();
        vi.useRealTimers();
      }
    },
  );
});
