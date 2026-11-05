import { describe, expect, test, vi } from "vite-plus/test";
import { withDisposal } from "../src/index.ts";
import type { AdapterResult } from "healthzkit";

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
