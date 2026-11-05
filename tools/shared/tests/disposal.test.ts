import { describe, expect, expectTypeOf, test, vi } from "vite-plus/test";
import { withDisposal } from "../src/index.ts";
import type { AdapterResult, HealthAdapter } from "healthzkit";

describe("withDisposal", () => {
  test.each([false, true])(
    "waits for all checks before cleanup (rejected=%s)",
    async (rejected) => {
      let finish!: (value: AdapterResult) => void;
      let fail!: (error: Error) => void;
      const work = new Promise<AdapterResult>((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
      const cleanup = vi.fn();
      const adapter = withDisposal({ check: () => work }, cleanup);
      const check = adapter.check();
      const settled = Promise.allSettled([check]);
      const closing = adapter.dispose();
      expect(adapter.dispose()).toBe(closing);
      await Promise.resolve();
      expect(cleanup).not.toHaveBeenCalled();
      expect((await adapter.check()).status).toBe("fail");
      if (rejected) fail(new Error("check failed"));
      else finish({ status: "ok" });
      await settled;
      await closing;
      expect(cleanup).toHaveBeenCalledOnce();
    },
  );

  test("preserves class identity, private state, inherited methods and hidden properties", async () => {
    class Adapter {
      #status = "ok" as const;
      async check(): Promise<{ status: "ok" }> {
        return { status: this.#status };
      }
      close() {
        return this.#status;
      }
    }
    const original = new Adapter();
    Object.defineProperty(original, "hidden", { value: 42 });
    const adapter = withDisposal(original, vi.fn());
    expectTypeOf(adapter.check).toEqualTypeOf<HealthAdapter["check"]>();
    expect(adapter).toBe(original);
    expect(adapter).toBeInstanceOf(Adapter);
    expect(Object.getOwnPropertyDescriptor(adapter, "hidden")?.value).toBe(42);
    expect(adapter.close()).toBe("ok");
    expect((await adapter.check()).status).toBe("ok");
    await adapter.dispose();
    expect((await adapter.check()).status).toBe("fail");
  });

  test("preserves existing disposal with its receiver and attempts both cleanups on failure", async () => {
    const errors = [new Error("original"), new Error("extra")];
    const original = {
      check: async (): Promise<AdapterResult> => ({ status: "ok" }),
      dispose: vi.fn(function (this: unknown) {
        expect(this).toBe(original);
        throw errors[0];
      }),
    };
    const originalDispose = original.dispose;
    const cleanup = vi.fn(() => {
      throw errors[1];
    });
    const adapter = withDisposal(original, cleanup);
    const closing = adapter.dispose();
    await expect(closing).rejects.toMatchObject({ name: "AggregateError", errors });
    expect(adapter.dispose()).toBe(closing);
    expect(originalDispose).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  test("retains cleanup rejection and never retries", async () => {
    const error = new Error("cleanup failed");
    const cleanup = vi.fn(() => {
      throw error;
    });
    const adapter = withDisposal({ check: async () => ({ status: "ok" as const }) }, cleanup);
    const closing = adapter.dispose();
    await expect(closing).rejects.toBe(error);
    expect(adapter.dispose()).toBe(closing);
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
