import { describe, expect, test } from "vite-plus/test";
import { createHealthKit } from "../src/healthkit.ts";
import { createFetchHandler, toFetchResponse } from "../src/http.ts";

describe("toFetchResponse", () => {
  test("copies status, headers, and body", async () => {
    const res = toFetchResponse({
      status: 503,
      headers: { "Content-Type": "application/json" },
      body: '{"status":"fail"}',
    });
    expect(res.status).toBe(503);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(await res.text()).toBe('{"status":"fail"}');
  });

  test("HEAD omits the body", async () => {
    const res = toFetchResponse(
      { status: 200, headers: { "Content-Type": "text/plain" }, body: "ok" },
      "HEAD",
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });
});

describe("createFetchHandler", () => {
  const kit = createHealthKit({
    checks: [
      { name: "process", type: ["liveness"], adapter: { check: async () => ({ status: "ok" }) } },
      {
        name: "db",
        type: ["readiness"],
        adapter: { check: async () => ({ status: "fail", error: "down" }) },
      },
    ],
  });
  const handler = createFetchHandler(kit);

  test("serves GET /healthz/live", async () => {
    const res = await handler(new Request("http://localhost/healthz/live"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; checks: { process: { status: string } } };
    expect(body.status).toBe("ok");
    expect(body.checks.process.status).toBe("ok");
  });

  test("serves GET /healthz/ready as 503 when a check fails", async () => {
    const res = await handler(new Request("http://localhost/healthz/ready"));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("fail");
  });

  test("HEAD matches GET status with an empty body", async () => {
    const res = await handler(new Request("http://localhost/healthz/live", { method: "HEAD" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });

  test("unknown paths are 404", async () => {
    const res = await handler(new Request("http://localhost/nope"));
    expect(res.status).toBe(404);
  });

  test("strips query strings before routing", async () => {
    const res = await handler(new Request("http://localhost/healthz/live?source=k8s"));
    expect(res.status).toBe(200);
  });

  test("POST does not run checks and returns 405", async () => {
    let ran = 0;
    const guarded = createFetchHandler(
      createHealthKit({
        checks: [
          {
            name: "process",
            type: ["liveness"],
            adapter: {
              check: async () => {
                ran += 1;
                return { status: "ok" };
              },
            },
          },
        ],
      }),
    );
    const res = await guarded(new Request("http://localhost/healthz/live", { method: "POST" }));
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD");
    expect(await res.text()).toBe("");
    expect(ran).toBe(0);
  });

  test("POST to an unknown path is 404, not 405", async () => {
    let ran = 0;
    const guarded = createFetchHandler(
      createHealthKit({
        checks: [
          {
            name: "process",
            type: ["liveness"],
            adapter: {
              check: async () => {
                ran += 1;
                return { status: "ok" };
              },
            },
          },
        ],
      }),
    );
    const res = await guarded(new Request("http://localhost/nope", { method: "POST" }));
    expect(res.status).toBe(404);
    expect(ran).toBe(0);
  });
});
