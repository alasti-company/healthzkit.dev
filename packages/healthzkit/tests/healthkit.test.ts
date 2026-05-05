import { describe, expect, test } from "vite-plus/test";
import { createHealthKit, HealthKit } from "../src/healthkit.ts";

describe("createHealthKit", () => {
  test("returns a HealthKit instance", () => {
    const kit = createHealthKit({ checks: [] });
    expect(kit).toBeInstanceOf(HealthKit);
  });
});

describe("HealthKit routing", () => {
  test("handleRequest returns null for unknown paths", async () => {
    const kit = createHealthKit({ checks: [] });
    expect(await kit.handleRequest({ path: "/nope" })).toBeNull();
  });

  test("handleRequest routes default /healthz/live to liveness", async () => {
    const kit = createHealthKit({
      checks: [
        { name: "live", type: ["liveness"], adapter: { check: async () => ({ status: "ok" }) } },
      ],
    });
    const res = await kit.handleRequest({ path: "/healthz/live" });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });

  test("respects custom basePath", async () => {
    const kit = createHealthKit({
      basePath: "/api/health",
      checks: [
        { name: "live", type: ["liveness"], adapter: { check: async () => ({ status: "ok" }) } },
      ],
    });
    expect(await kit.handleRequest({ path: "/healthz/live" })).toBeNull();
    const res = await kit.handleRequest({ path: "/api/health/live" });
    expect(res!.status).toBe(200);
  });
});

describe("HealthKit responses", () => {
  test("aggregates ok as 200 JSON with metadata", async () => {
    const kit = createHealthKit({
      checks: [
        {
          name: "db",
          type: ["readiness"],
          adapter: { check: async () => ({ status: "ok", metadata: { v: 1 } }) },
        },
      ],
    });
    const res = await kit.handleReadiness();
    expect(res.status).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(res.body) as {
      status: string;
      checks: Record<string, { status: string; metadata?: unknown }>;
    };
    expect(body.status).toBe("ok");
    expect(body.checks.db.status).toBe("ok");
    expect(body.checks.db.metadata).toEqual({ v: 1 });
  });

  test("fail yields 503 by default", async () => {
    const kit = createHealthKit({
      checks: [
        {
          name: "x",
          type: ["liveness"],
          adapter: { check: async () => ({ status: "fail", error: "down" }) },
        },
      ],
    });
    const res = await kit.handleLiveness();
    expect(res.status).toBe(503);
    const body = JSON.parse(res.body) as {
      status: string;
      checks: Record<string, { error?: string }>;
    };
    expect(body.status).toBe("fail");
    expect(body.checks.x.error).toBe("down");
  });

  test("per-check onFail httpStatus overrides response status", async () => {
    const kit = createHealthKit({
      checks: [
        {
          name: "x",
          type: ["liveness"],
          adapter: { check: async () => ({ status: "fail" }) },
          onFail: { httpStatus: 418 },
        },
      ],
    });
    const res = await kit.handleLiveness();
    expect(res.status).toBe(418);
  });

  test("defaults.onFail httpStatus when no per-check override", async () => {
    const kit = createHealthKit({
      checks: [
        { name: "x", type: ["liveness"], adapter: { check: async () => ({ status: "fail" }) } },
      ],
      defaults: { onFail: { httpStatus: 500 } },
    });
    const res = await kit.handleLiveness();
    expect(res.status).toBe(500);
  });

  test("onFail.treatAs maps fail to degraded", async () => {
    const kit = createHealthKit({
      checks: [
        {
          name: "x",
          type: ["liveness"],
          adapter: { check: async () => ({ status: "fail" }) },
          onFail: { treatAs: "degraded" },
        },
      ],
    });
    const res = await kit.handleLiveness();
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as {
      status: string;
      checks: Record<string, { status: string }>;
    };
    expect(body.status).toBe("degraded");
    expect(body.checks.x.status).toBe("degraded");
  });

  test("degraded uses defaults.onDegraded httpStatus", async () => {
    const kit = createHealthKit({
      checks: [
        { name: "x", type: ["liveness"], adapter: { check: async () => ({ status: "degraded" }) } },
      ],
      defaults: { onDegraded: { httpStatus: 299 } },
    });
    const res = await kit.handleLiveness();
    expect(res.status).toBe(299);
  });

  test("text output format", async () => {
    const kit = createHealthKit({
      checks: [
        { name: "ping", type: ["liveness"], adapter: { check: async () => ({ status: "ok" }) } },
      ],
      output: { format: "text" },
    });
    const res = await kit.handleLiveness();
    expect(res.headers["Content-Type"]).toBe("text/plain");
    expect(res.body).toContain("status: ok");
    expect(res.body).toContain("ping: ok");
  });

  test("exposeError false omits error string from check result", async () => {
    const kit = createHealthKit({
      checks: [
        {
          name: "x",
          type: ["liveness"],
          adapter: { check: async () => ({ status: "fail", error: "secret" }) },
        },
      ],
      output: { exposeError: false },
    });
    const res = await kit.handleLiveness();
    const body = JSON.parse(res.body) as { checks: Record<string, { error?: string }> };
    expect(body.checks.x.error).toBeUndefined();
  });

  test("rollup.computeStatus can override aggregated status", async () => {
    const kit = createHealthKit({
      checks: [
        { name: "a", type: ["liveness"], adapter: { check: async () => ({ status: "ok" }) } },
        { name: "b", type: ["liveness"], adapter: { check: async () => ({ status: "ok" }) } },
      ],
      rollup: {
        computeStatus: () => "degraded",
      },
    });
    const res = await kit.handleLiveness();
    const body = JSON.parse(res.body) as { status: string };
    expect(body.status).toBe("degraded");
  });

  test("only runs checks whose type includes the probe", async () => {
    const kit = createHealthKit({
      checks: [
        {
          name: "ready",
          type: ["readiness"],
          adapter: { check: async () => ({ status: "fail" }) },
        },
      ],
    });
    const res = await kit.handleLiveness();
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as { checks: Record<string, unknown> };
    expect(Object.keys(body.checks)).toHaveLength(0);
  });

  test("adapter timeout surfaces as fail", async () => {
    const kit = createHealthKit({
      checks: [
        {
          name: "slow",
          type: ["liveness"],
          adapter: { check: () => new Promise(() => {}) },
          timeout: 30,
        },
      ],
    });
    const res = await kit.handleLiveness();
    expect(res.status).toBe(503);
    const body = JSON.parse(res.body) as {
      checks: Record<string, { status: string; error?: string }>;
    };
    expect(body.checks.slow.status).toBe("fail");
    expect(body.checks.slow.error).toMatch(/timed out/);
  });
});

describe("HealthKit lifecycle", () => {
  test("start and stop accept scheduled checks", () => {
    const kit = createHealthKit({
      checks: [
        {
          name: "c",
          type: ["liveness"],
          adapter: { check: async () => ({ status: "ok" }) },
          schedule: { intervalMs: 60_000 },
        },
      ],
    });
    kit.start();
    kit.start();
    kit.stop();
  });
});
