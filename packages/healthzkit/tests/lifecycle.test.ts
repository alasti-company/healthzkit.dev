import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { createHealthKit } from "../src/healthkit.ts";
import { createFetchHandler } from "../src/http.ts";
import type { AdapterResult, CheckStatus } from "../src/types.ts";

afterEach(() => vi.useRealTimers());

describe("startup", () => {
  test("awaits initial scheduled work and allows failure to recover on refresh", async () => {
    vi.useFakeTimers();
    let finish!: (result: AdapterResult) => void;
    const check = vi.fn(
      () =>
        new Promise<AdapterResult>((resolve) => {
          finish = resolve;
        }),
    );
    const kit = createHealthKit({
      checks: [
        { name: "init", type: ["startup"], adapter: { check }, schedule: { intervalMs: 100 } },
      ],
    });
    kit.start();
    try {
      let settled = false;
      const pending = kit.handleStartup().then((result) => {
        settled = true;
        return result;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(check).toHaveBeenCalledTimes(1);
      finish({ status: "fail" });
      expect((await pending).status).toBe(503);
      const head = await createFetchHandler(kit)(
        new Request("http://localhost/healthz/startup", { method: "HEAD" }),
      );
      expect(head.status).toBe(503);
      expect(await head.text()).toBe("");
      await vi.advanceTimersByTimeAsync(100);
      finish({ status: "ok" });
      await vi.advanceTimersByTimeAsync(0);
      expect((await kit.handleStartup()).status).toBe(200);
    } finally {
      kit.stop();
    }
  });

  test("pending startup times out without blocking independent liveness", async () => {
    vi.useFakeTimers();
    const kit = createHealthKit({
      defaults: { timeout: 50 },
      checks: [
        { name: "init", type: ["startup"], adapter: { check: () => new Promise(() => {}) } },
      ],
    });
    const pending = kit.handleStartup();
    expect((await kit.handleLiveness()).status).toBe(200);
    await vi.advanceTimersByTimeAsync(50);
    expect((await pending).status).toBe(503);
  });

  test("direct and Fetch startup routes honor exact custom paths and methods", async () => {
    const check = vi.fn(async () => ({ status: "ok" as const }));
    const kit = createHealthKit({
      basePath: "/internal",
      checks: [{ name: "init", type: ["startup"], adapter: { check } }],
    });
    const handler = createFetchHandler(kit);
    expect(kit.matchHealthPath("/internal/startup")).toBe(true);
    for (const path of ["/healthz/startup", "/internal/startup/", "/internal/startup-extra"]) {
      expect(kit.matchHealthPath(path)).toBe(false);
      expect(await kit.handleRequest({ path })).toBeNull();
      expect((await handler(new Request(`http://localhost${path}`))).status).toBe(404);
    }
    for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) {
      const direct = await kit.handleRequest({ path: "/internal/startup", method });
      expect(direct).toMatchObject({ status: 405, headers: { Allow: "GET, HEAD" } });
      const response = await handler(new Request("http://localhost/internal/startup", { method }));
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
    }
    expect(check).not.toHaveBeenCalled();
    expect((await kit.handleRequest({ path: "/internal/startup" }))?.status).toBe(200);
    expect(await kit.handleRequest({ path: "/internal/startup", method: "head" })).toMatchObject({
      status: 200,
      body: "",
    });
    const get = await handler(new Request("http://localhost/internal/startup?source=k8s"));
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({ checks: { init: { status: "ok" } } });
    const head = await handler(
      new Request("http://localhost/internal/startup", { method: "HEAD" }),
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await createHealthKit({ checks: [] }).handleStartup()).status).toBe(200);
  });
});

describe("drain", () => {
  test("overrides cached readiness and custom policy, preserves liveness and scheduling", async () => {
    vi.useFakeTimers();
    const check = vi.fn(async () => ({ status: "ok" as const }));
    let liveStatus: CheckStatus = "ok";
    const kit = createHealthKit({
      defaults: { onFail: { httpStatus: 200 } },
      rollup: { computeStatus: () => "ok" },
      checks: [
        { name: "db", type: ["readiness"], adapter: { check }, schedule: { intervalMs: 100 } },
        {
          name: "process",
          type: ["liveness"],
          adapter: { check: async () => ({ status: liveStatus }) },
          onFail: { httpStatus: 502 },
        },
      ],
    });
    kit.start();
    kit.start();
    try {
      expect((await kit.handleReadiness()).status).toBe(200);
      expect(JSON.parse((await kit.handleReadiness()).body).checks.db.cachedAt).toEqual(
        expect.any(String),
      );
      kit.beginDrain();
      kit.beginDrain();
      const response = await kit.handleReadiness();
      expect(response.status).toBe(503);
      expect(JSON.parse(response.body)).toMatchObject({ status: "fail", checks: {} });
      expect(check).toHaveBeenCalledTimes(1);
      expect((await kit.handleLiveness()).status).toBe(200);
      liveStatus = "fail";
      expect((await kit.handleLiveness()).status).toBe(502);
      await vi.advanceTimersByTimeAsync(100);
      expect(check).toHaveBeenCalledTimes(2);
      kit.stop();
      kit.stop();
      kit.start();
      kit.start();
      expect((await kit.handleReadiness()).status).toBe(503);
      expect((await kit.handleStartup()).status).toBe(200);
    } finally {
      kit.stop();
    }
  });

  test("drain before start and repeated stop do not reset drain; a new kit does", async () => {
    const kit = createHealthKit({ checks: [], output: { format: "text" } });
    kit.stop();
    expect((await kit.handleReadiness()).status).toBe(200);
    kit.beginDrain();
    kit.beginDrain();
    kit.start();
    kit.stop();
    expect(await kit.handleReadiness()).toMatchObject({ status: 503, body: "status: fail" });
    const response = await createFetchHandler(kit)(
      new Request("http://localhost/healthz/ready", { method: "HEAD" }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
    expect((await createHealthKit({ checks: [] }).handleReadiness()).status).toBe(200);
  });

  test("new readiness requests fail immediately while an older request is pending", async () => {
    let finish!: (result: AdapterResult) => void;
    const check = vi.fn(
      () =>
        new Promise<AdapterResult>((resolve) => {
          finish = resolve;
        }),
    );
    const kit = createHealthKit({
      checks: [{ name: "db", type: ["readiness"], adapter: { check } }],
    });
    const pending = kit.handleReadiness();
    // The runner awaits its cache lookup before starting an on-demand operation.
    await vi.waitFor(() => expect(check).toHaveBeenCalledOnce());
    kit.beginDrain();
    expect((await kit.handleReadiness()).status).toBe(503);
    finish({ status: "ok" });
    const response = await pending;
    expect(response.status).toBe(503);
    expect(JSON.parse(response.body).status).toBe("fail");
    expect(check).toHaveBeenCalledOnce();
  });
});
