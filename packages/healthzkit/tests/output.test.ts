import { describe, expect, test, vi } from "vite-plus/test";
import { createHealthKit } from "../src/healthkit.ts";
import { createFetchHandler, toFetchResponse } from "../src/http.ts";
import type { AdapterResult, CheckResult, OutputConfig } from "../src/types.ts";

function kitFor(result: AdapterResult, output?: OutputConfig) {
  return createHealthKit({
    checks: [
      {
        name: "private-db",
        type: ["liveness", "readiness", "startup"],
        adapter: {
          check: async () => result,
        },
      },
    ],
    output,
  });
}

describe("public output boundary", () => {
  test("caller output mutations cannot expose diagnostics during pending checks", async () => {
    let resolve!: (value: AdapterResult) => void;
    const operation = new Promise<AdapterResult>((done) => {
      resolve = done;
    });
    const paths = ["/region"];
    const output: OutputConfig = { exposeMetadata: paths, exposeError: false };
    const kit = createHealthKit({
      output,
      checks: [
        {
          name: "db",
          type: ["readiness"],
          adapter: {
            check: () => operation,
          },
        },
      ],
    });
    const pending = kit.handleReadiness();
    await Promise.resolve();
    paths.push("/secret");
    output.exposeMetadata = true;
    output.exposeError = true;
    resolve({ status: "ok", error: "secret", metadata: { region: "local", secret: "hidden" } });
    const response = await pending;
    expect(JSON.parse(response.body).checks.db).toMatchObject({ metadata: { region: "local" } });
    expect(response.body).not.toContain("secret");
    expect(response.body).not.toContain("hidden");
  });
  test.each(["json", "text"] as const)(
    "throwing metadata proxies fail closed in %s",
    async (format) => {
      const metadata = new Proxy(
        {},
        {
          getPrototypeOf() {
            throw new Error("proxy-secret");
          },
        },
      );
      const res = await kitFor(
        { status: "ok", metadata },
        { format, exposeMetadata: ["/region"] },
      ).handleReadiness();
      expect(res.status).toBe(200);
      expect(res.body).not.toContain("proxy-secret");
      if (format === "json")
        expect(JSON.parse(res.body).checks["private-db"].metadata).toBeUndefined();
    },
  );
  test("draining responses retain no-store and status-only filtering", async () => {
    const kit = kitFor({ status: "ok" }, { detail: "status" });
    kit.beginDrain();
    const res = await kit.handleReadiness();
    expect(res.status).toBe(503);
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(JSON.parse(res.body)).toEqual({ status: "fail" });
  });
  test("preserves diagnostic defaults for compatibility", async () => {
    const res = await kitFor({
      status: "fail",
      error: new Error("private error"),
      metadata: { credentials: { password: "secret" } },
    }).handleReadiness();
    expect(JSON.parse(res.body).checks["private-db"]).toMatchObject({
      error: "private error",
      metadata: { credentials: { password: "secret" } },
    });
  });

  test.each(["json", "text"] as const)(
    "omits errors and metadata in %s without changing rollup diagnostics",
    async (format) => {
      const metadata = { nested: { password: "secret" } };
      const computeStatus = vi.fn((results: Record<string, CheckResult>) => {
        expect(results["private-db"].error).toBe("private error");
        expect(results["private-db"].metadata).toBe(metadata);
        return results["private-db"].status;
      });
      const kit = createHealthKit({
        checks: [
          {
            name: "private-db",
            type: ["readiness"],
            onFail: { httpStatus: 429 },
            adapter: { check: async () => ({ status: "fail", error: "private error", metadata }) },
          },
        ],
        rollup: { computeStatus },
        output: { format, exposeError: false, exposeMetadata: false },
      });
      const res = await kit.handleReadiness();
      expect(res.status).toBe(429);
      expect(res.body).not.toMatch(/private error|secret|nested|metadata/);
      expect(res.body).toContain("private-db");
      expect(computeStatus).toHaveBeenCalledOnce();
      expect(metadata).toEqual({ nested: { password: "secret" } });
    },
  );

  test("allowlists only explicit scalar JSON Pointer leaves", async () => {
    const getter = vi.fn(() => "getter-secret");
    const toJSON = vi.fn(() => ({ secret: "serializer-secret" }));
    const metadata = Object.freeze({
      region: "west",
      service: Object.freeze({ version: 3, password: "nested-secret" }),
      list: ["array-secret"],
      nullable: null,
      enabled: true,
      missing: undefined,
      invalid: Infinity,
      big: 1n,
      "slash/key": { "tilde~key": "escaped" },
      unsafe: { toJSON },
      get accessor() {
        return getter();
      },
    });
    const res = await kitFor(
      { status: "ok", metadata },
      {
        exposeMetadata: [
          "/region",
          "/service",
          "/service/version",
          "/list",
          "/list/0",
          "/nullable",
          "/enabled",
          "/missing",
          "/invalid",
          "/big",
          "/accessor",
          "/unsafe",
          "/unsafe/toJSON",
          "/toString",
          "/__proto__/polluted",
          "/constructor/name",
          "/slash~1key/tilde~0key",
          "region",
          "/bad~2escape",
        ],
      },
    ).handleReadiness();
    expect(JSON.parse(res.body).checks["private-db"].metadata).toEqual({
      region: "west",
      service: { version: 3 },
      nullable: null,
      enabled: true,
      "slash/key": { "tilde~key": "escaped" },
    });
    expect(getter).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
    expect(metadata.service.password).toBe("nested-secret");
  });

  test.each([{ paths: [] }, { paths: ["/nested"] }, { paths: ["/unknown"] }])(
    "empty or non-scalar allowlist $paths omits metadata",
    async ({ paths }) => {
      const res = await kitFor(
        { status: "ok", metadata: { nested: { password: "secret" } } },
        { exposeMetadata: paths },
      ).handleLiveness();
      expect(JSON.parse(res.body).checks["private-db"]).not.toHaveProperty("metadata");
    },
  );

  test.each(["json", "text"] as const)(
    "allowlists never introduce metadata into %s text fields",
    async (format) => {
      const res = await kitFor(
        {
          status: "fail",
          error: "error-secret",
          metadata: { region: "west", password: "metadata-secret" },
        },
        { format, exposeError: false, exposeMetadata: ["/region"] },
      ).handleReadiness();
      expect(res.status).toBe(503);
      expect(res.body).not.toMatch(/error-secret|metadata-secret/);
      if (format === "json")
        expect(JSON.parse(res.body).checks["private-db"].metadata).toEqual({ region: "west" });
      else expect(res.body).toMatch(/^status: fail\nprivate-db: fail \(\d+ms\)$/);
    },
  );

  test.each(["ok", "degraded", "fail"] as const)(
    "status-only %s excludes every diagnostic in both formats",
    async (status) => {
      const toJSON = vi.fn(() => {
        throw new Error("must not serialize");
      });
      for (const format of ["json", "text"] as const) {
        const res = await kitFor(
          { status, error: "secret", metadata: { toJSON } },
          { format, detail: "status", exposeError: true, exposeMetadata: true },
        ).handleReadiness();
        expect(res.status).toBe(status === "fail" ? 503 : 200);
        expect(res.body).toBe(format === "json" ? JSON.stringify({ status }) : `status: ${status}`);
      }
      expect(toJSON).not.toHaveBeenCalled();
    },
  );

  test.each(["ok", "fail"] as const)(
    "no-store survives direct, Fetch, and HEAD responses for %s",
    async (status) => {
      const kit = kitFor({ status });
      for (const path of ["live", "ready", "startup"]) {
        const direct = await kit.handleRequest({ path: `/healthz/${path}` });
        expect(direct?.headers["Cache-Control"]).toBe("no-store");
        for (const method of ["GET", "HEAD"]) {
          const converted = toFetchResponse(direct!, method);
          const handled = await createFetchHandler(kit)(
            new Request(`http://localhost/healthz/${path}`, { method }),
          );
          for (const response of [converted, handled]) {
            expect(response.headers.get("cache-control")).toBe("no-store");
            expect(response.status).toBe(status === "fail" ? 503 : 200);
            if (method === "HEAD") expect(await response.text()).toBe("");
          }
        }
      }
    },
  );
});
