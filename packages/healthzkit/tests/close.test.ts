import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { createHealthKit } from "../src/healthkit.ts";
import type { AdapterResult, HealthAdapter } from "../src/types.ts";

afterEach(() => vi.useRealTimers());

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function kitWith(adapter: HealthAdapter, scheduled = false) {
  return createHealthKit({
    checks: [
      {
        name: "db",
        type: ["readiness"],
        adapter,
        timeout: 10,
        ...(scheduled && { schedule: { intervalMs: 20 } }),
      },
    ],
  });
}

describe("terminal close", () => {
  test("keeps accepted HTTP output filtered while close waits for completion", async () => {
    const work = deferred<AdapterResult>();
    const dispose = vi.fn();
    const kit = createHealthKit({
      output: { exposeError: false, exposeMetadata: ["/region"] },
      checks: [
        { name: "db", type: ["readiness"], adapter: { check: () => work.promise, dispose } },
      ],
    });
    const pending = kit.handleReadiness();
    const closing = kit.close();
    expect(dispose).not.toHaveBeenCalled();
    work.resolve({
      status: "ok",
      error: "private-error",
      metadata: { region: "local", secret: "private-value" },
    });
    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.headers["Cache-Control"]).toBe("no-store");
    expect(JSON.parse(response.body).checks.db.metadata).toEqual({ region: "local" });
    expect(response.body).not.toContain("private-");
    await closing;
    expect(dispose).toHaveBeenCalledOnce();
  });

  test("is promise-idempotent, deduplicates adapters, and supports check-only adapters", async () => {
    const dispose = vi.fn();
    const adapter = { check: async () => ({ status: "ok" as const }), dispose };
    const kit = createHealthKit({
      checks: [
        { name: "a", type: ["readiness"], adapter },
        { name: "b", type: ["readiness"], adapter },
        { name: "c", type: ["readiness"], adapter: { check: adapter.check } },
      ],
    });
    const closing = kit.close();
    expect(kit.close()).toBe(closing);
    await closing;
    await kit.close();
    expect(dispose).toHaveBeenCalledOnce();
    expect(() => kit.start()).toThrow("HealthKit is closed");
    await expect(kit.handleReadiness()).rejects.toThrow("HealthKit is closed");
    await expect(kit.handleLiveness()).rejects.toThrow("HealthKit is closed");
    await expect(kit.handleRequest({ path: "/healthz/ready" })).rejects.toThrow(
      "HealthKit is closed",
    );
    await expect(kit.handleRequest({ path: "/healthz/ready", method: "POST" })).rejects.toThrow(
      "HealthKit is closed",
    );
    expect(await kit.handleRequest({ path: "/other" })).toBeNull();
  });

  test.each(["http", "structured"] as const)(
    "preserves accepted scheduled success during close (%s)",
    async (api) => {
      vi.useFakeTimers();
      const work = deferred<AdapterResult>();
      const check = vi.fn(() => work.promise);
      const dispose = vi.fn();
      const kit = kitWith({ check, dispose }, true);
      kit.start();
      const response = api === "http" ? kit.handleReadiness() : kit.checkReadiness();
      const closing = kit.close();
      await vi.advanceTimersByTimeAsync(1);
      expect(dispose).not.toHaveBeenCalled();
      work.resolve({ status: "ok", metadata: { recovered: true } });
      expect((await response).status).toBe(api === "http" ? 200 : "ok");
      await closing;
      expect(dispose).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(100);
      expect(check).toHaveBeenCalledOnce();
    },
  );

  test("rejects every public check API as soon as close begins", async () => {
    const kit = kitWith({ check: async () => ({ status: "ok" }) });
    const closing = kit.close();
    for (const check of [
      () => kit.checkLiveness(),
      () => kit.checkReadiness(),
      () => kit.checkStartup(),
      () => kit.handleStartup(),
    ]) {
      await expect(check()).rejects.toThrow("HealthKit is closed");
    }
    await closing;
  });

  test("waits for accepted structured calls after their response timeout", async () => {
    vi.useFakeTimers();
    const work = deferred<AdapterResult>();
    const dispose = vi.fn();
    const kit = kitWith({ check: () => work.promise, dispose });
    const response = kit.checkReadiness();
    const closing = kit.close();
    await vi.advanceTimersByTimeAsync(20);
    expect((await response).status).toBe("fail");
    expect(dispose).not.toHaveBeenCalled();
    work.resolve({ status: "ok" });
    await closing;
    expect(dispose).toHaveBeenCalledOnce();
  });

  test.each([false, true])(
    "waits for underlying work past its deadline (scheduled=%s)",
    async (scheduled) => {
      vi.useFakeTimers();
      const work = deferred<AdapterResult>();
      const check = vi.fn(() => work.promise);
      const dispose = vi.fn();
      const kit = kitWith({ check, dispose }, scheduled);
      if (scheduled) kit.start();
      const response = kit.handleReadiness();
      // Close immediately, before the request has reached its first check.
      const closing = kit.close();
      let closed = false;
      void closing.then(() => {
        closed = true;
      });
      await vi.advanceTimersByTimeAsync(100);
      expect((await response).status).toBe(503);
      expect(check).toHaveBeenCalledOnce();
      expect(dispose).not.toHaveBeenCalled();
      expect(closed).toBe(false);
      work.resolve({ status: "ok" });
      await closing;
      expect(dispose).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(100);
      expect(check).toHaveBeenCalledOnce();
    },
  );

  test("waits for previously timed-out work even after stop", async () => {
    vi.useFakeTimers();
    const work = deferred<AdapterResult>();
    const dispose = vi.fn();
    const kit = kitWith({ check: () => work.promise, dispose });
    const response = kit.handleReadiness();
    await vi.advanceTimersByTimeAsync(10);
    await response;
    kit.stop();
    const closing = kit.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(dispose).not.toHaveBeenCalled();
    work.resolve({ status: "ok" });
    await closing;
    expect(dispose).toHaveBeenCalledOnce();
  });

  test("attempts all cleanup hooks and preserves errors without retrying", async () => {
    const errors = [new Error("first"), new Error("second")];
    const disposers = errors.map((error) =>
      vi.fn(() => {
        throw error;
      }),
    );
    const successful = vi.fn();
    const kit = createHealthKit({
      checks: [...disposers, successful].map((dispose, i) => ({
        name: String(i),
        type: ["readiness"],
        adapter: {
          check: async () => ({ status: "ok" }),
          dispose,
        },
      })),
    });
    const closing = kit.close();
    await expect(closing).rejects.toMatchObject({ name: "AggregateError", errors });
    expect(kit.close()).toBe(closing);
    for (const dispose of [...disposers, successful]) expect(dispose).toHaveBeenCalledOnce();
  });

  test("stop remains reusable and does not dispose", async () => {
    const dispose = vi.fn();
    const kit = kitWith({ check: async () => ({ status: "ok" }), dispose });
    kit.start();
    kit.stop();
    kit.start();
    kit.stop();
    expect((await kit.handleReadiness()).status).toBe(200);
    expect(dispose).not.toHaveBeenCalled();
    await kit.close();
  });
});
