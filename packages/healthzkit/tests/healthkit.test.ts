import { describe, expect, test, vi } from "vite-plus/test";
import { createHealthKit, HealthKit } from "../src/healthkit.ts";
import type { HealthkitConfig } from "../src/types.ts";

describe("createHealthKit", () => {
  test("returns a HealthKit instance", () => {
    const kit = createHealthKit({ checks: [] });
    expect(kit).toBeInstanceOf(HealthKit);
  });
});

describe("HealthKit configuration", () => {
  const constructors = [
    { name: "createHealthKit", create: createHealthKit },
    { name: "new HealthKit", create: (config: HealthkitConfig) => new HealthKit(config) },
  ];

  describe.each(constructors)("$name timing validation", ({ create }) => {
    const invalidValues = [0, -1, 0.5, 1.5, NaN, Infinity, -Infinity, 2_147_483_648];
    const fields = ["defaults.timeout", "timeout", "schedule.intervalMs"] as const;

    describe.each(fields)("%s", (field) => {
      const configWith = (value: number): HealthkitConfig => ({
        defaults: field === "defaults.timeout" ? { timeout: value } : undefined,
        checks: [
          {
            name: "db",
            type: ["readiness"],
            adapter: { check: async () => ({ status: "ok" }) },
            // A check override must not hide an invalid default.
            timeout: field === "timeout" ? value : 5_000,
            schedule: field === "schedule.intervalMs" ? { intervalMs: value } : undefined,
          },
        ],
      });

      test.each(invalidValues)("rejects %s at construction", (value) => {
        const label = field === "defaults.timeout" ? field : `Check "db" ${field}`;
        expect(() => create(configWith(value))).toThrow(
          new RangeError(`${label} must be an integer between 1 and 2147483647 milliseconds.`),
        );
      });

      test.each([1, 5_000, 2_147_483_647])("accepts %s without starting timers", (value) => {
        expect(() => create(configWith(value))).not.toThrow();
      });
    });

    test("validates defaults even when there are no checks", () => {
      expect(() => create({ checks: [], defaults: { timeout: 0 } })).toThrow(
        "defaults.timeout must be an integer between 1 and 2147483647 milliseconds.",
      );
    });

    test("captures validated nested timing configuration", async () => {
      const defaults = { timeout: 5_000 };
      const schedule = { intervalMs: 60_000 };
      const adapter = { check: async () => ({ status: "ok" as const }) };
      const kit = create({
        defaults,
        checks: [{ name: "db", type: ["readiness"], adapter, schedule }],
      });
      defaults.timeout = 0;
      schedule.intervalMs = NaN;
      // These are the snapshots passed to the actual timer APIs.
      const interval = vi.spyOn(globalThis, "setInterval");
      const timeout = vi.spyOn(globalThis, "setTimeout");
      try {
        kit.start();
        expect(interval).toHaveBeenCalledWith(expect.any(Function), 60_000);
        expect(timeout).toHaveBeenCalledWith(expect.any(Function), 5_000);
        expect((await kit.handleReadiness()).status).toBe(200);
      } finally {
        kit.stop();
        interval.mockRestore();
        timeout.mockRestore();
      }
    });
  });

  test.each(constructors)("$name rejects duplicate readiness check names", ({ create }) => {
    expect(() =>
      create({
        checks: [
          { name: "db", type: ["readiness"], adapter: { check: async () => ({ status: "fail" }) } },
          { name: "db", type: ["readiness"], adapter: { check: async () => ({ status: "ok" }) } },
        ],
      }),
    ).toThrow('Duplicate check name "db". Check names must be unique.');
  });

  test("rejects duplicate names across probe types for scheduled checks", () => {
    expect(() =>
      createHealthKit({
        checks: [
          {
            name: "db",
            type: ["readiness"],
            adapter: { check: async () => ({ status: "fail" }) },
            schedule: { intervalMs: 100 },
          },
          {
            name: "db",
            type: ["liveness"],
            adapter: { check: async () => ({ status: "ok" }) },
            schedule: { intervalMs: 100 },
          },
        ],
      }),
    ).toThrow('Duplicate check name "db". Check names must be unique.');
  });

  test("distinct names preserve both results and the failing status", async () => {
    const kit = createHealthKit({
      checks: [
        { name: "db", type: ["readiness"], adapter: { check: async () => ({ status: "fail" }) } },
        { name: "cache", type: ["readiness"], adapter: { check: async () => ({ status: "ok" }) } },
      ],
    });
    const response = await kit.handleReadiness();
    expect(response.status).toBe(503);
    expect(JSON.parse(response.body)).toMatchObject({
      status: "fail",
      checks: { db: { status: "fail" }, cache: { status: "ok" } },
    });
  });

  describe.each([false, true])("configuration mutations (scheduled: %s)", (scheduled) => {
    test.each(["append", "rename", "replace entry", "replace list"])(
      "%s cannot introduce duplicate names after construction",
      async (mutation) => {
        const config: HealthkitConfig = {
          checks: [
            {
              name: "db",
              type: ["readiness"],
              adapter: { check: async () => ({ status: "fail" }) },
              ...(scheduled && { schedule: { intervalMs: 60_000 } }),
            },
            {
              name: "cache",
              type: ["readiness"],
              adapter: { check: async () => ({ status: "ok" }) },
              ...(scheduled && { schedule: { intervalMs: 60_000 } }),
            },
          ],
        };
        const kit = createHealthKit(config);
        if (scheduled) kit.start();
        try {
          const duplicate = { ...config.checks[1], name: "db" };
          if (mutation === "append") config.checks.push(duplicate);
          if (mutation === "rename") config.checks[1].name = "db";
          if (mutation === "replace entry") config.checks[1] = duplicate;
          if (mutation === "replace list") config.checks = [config.checks[0], duplicate];

          const response = await kit.handleReadiness();
          expect(response.status).toBe(503);
          expect(JSON.parse(response.body)).toMatchObject({
            status: "fail",
            checks: { db: { status: "fail" }, cache: { status: "ok" } },
          });
        } finally {
          kit.stop();
        }
      },
    );
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

  test("per-check onDegraded httpStatus overrides the degraded default", async () => {
    const kit = createHealthKit({
      checks: [
        {
          name: "db",
          type: ["readiness"],
          adapter: { check: async () => ({ status: "degraded" }) },
          onDegraded: { httpStatus: 503 },
        },
      ],
      defaults: { onDegraded: { httpStatus: 299 } },
    });
    const res = await kit.handleReadiness();
    expect(res.status).toBe(503);
    expect(JSON.parse(res.body)).toMatchObject({
      status: "degraded",
      checks: { db: { status: "degraded" } },
    });
  });

  test("first matching degraded override wins in config order, not completion order", async () => {
    const kit = createHealthKit({
      checks: [
        {
          name: "no-override",
          type: ["readiness"],
          adapter: { check: async () => ({ status: "degraded" }) },
        },
        {
          name: "first",
          type: ["readiness"],
          adapter: {
            check: async () => {
              await new Promise((resolve) => setTimeout(resolve, 10));
              return { status: "degraded" };
            },
          },
          onDegraded: { httpStatus: 429 },
        },
        {
          name: "second",
          type: ["readiness"],
          adapter: { check: async () => ({ status: "degraded" }) },
          onDegraded: { httpStatus: 503 },
        },
      ],
    });
    expect((await kit.handleReadiness()).status).toBe(429);
  });

  test.each([undefined, 502])(
    "failure takes precedence over a degraded override (onFail: %s)",
    async (httpStatus) => {
      const kit = createHealthKit({
        checks: [
          {
            name: "slow",
            type: ["readiness"],
            adapter: { check: async () => ({ status: "degraded" }) },
            onDegraded: { httpStatus: 200 },
          },
          {
            name: "down",
            type: ["readiness"],
            adapter: { check: async () => ({ status: "fail" }) },
            onFail: { httpStatus },
          },
        ],
        defaults: { onFail: { httpStatus: 504 } },
      });
      expect((await kit.handleReadiness()).status).toBe(httpStatus ?? 504);
    },
  );

  test("onDegraded applies to failures remapped to degraded, not onFail.httpStatus", async () => {
    const kit = createHealthKit({
      checks: [
        {
          name: "optional",
          type: ["readiness"],
          adapter: { check: async () => ({ status: "fail" }) },
          onFail: { treatAs: "degraded", httpStatus: 500 },
          onDegraded: { httpStatus: 429 },
        },
      ],
    });
    expect((await kit.handleReadiness()).status).toBe(429);
  });

  test("degraded overrides ignore healthy checks and checks for another probe", async () => {
    const kit = createHealthKit({
      checks: [
        {
          name: "healthy",
          type: ["readiness"],
          adapter: { check: async () => ({ status: "ok" }) },
          onDegraded: { httpStatus: 500 },
        },
        {
          name: "live",
          type: ["liveness"],
          adapter: { check: async () => ({ status: "degraded" }) },
          onDegraded: { httpStatus: 501 },
        },
        {
          name: "ready",
          type: ["readiness"],
          adapter: { check: async () => ({ status: "degraded" }) },
        },
      ],
      defaults: { onDegraded: { httpStatus: 299 } },
    });
    expect((await kit.handleReadiness()).status).toBe(299);
  });

  test.each([
    { overallStatus: "ok", expected: 200 },
    { overallStatus: "fail", expected: 503 },
  ] as const)(
    "custom $overallStatus rollup does not use degraded overrides",
    async ({ overallStatus, expected }) => {
      const kit = createHealthKit({
        checks: [
          {
            name: "db",
            type: ["readiness"],
            adapter: { check: async () => ({ status: "degraded" }) },
            onDegraded: { httpStatus: 429 },
          },
        ],
        rollup: { computeStatus: () => overallStatus },
      });
      expect((await kit.handleReadiness()).status).toBe(expected);
    },
  );

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
