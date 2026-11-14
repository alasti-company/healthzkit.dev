import { createHealthKit } from "healthzkit";
import { describe, expect, test } from "vite-plus/test";
import { azureAppService } from "../src/azure-app-service.ts";
import { azureContainerApps } from "../src/azure-container-apps.ts";
import { cloudRun } from "../src/cloud-run.ts";
import { digitalOcean } from "../src/digitalocean.ts";
import { fly } from "../src/fly.ts";
import { koyeb } from "../src/koyeb.ts";
import { railway } from "../src/railway.ts";
import { render } from "../src/render.ts";
import { vercel } from "../src/vercel.ts";
import { createPaasFetchHandler, detectPaas, handlePaas } from "../src/index.ts";
import type { PaasCheck, PaasKit, PaasOptions, PaasProfile } from "../src/index.ts";

interface FakeKit extends PaasKit {
  calls: PaasCheck[];
}

function fakeKit(status = 200, body = '{"status":"ok"}'): FakeKit {
  const calls: PaasCheck[] = [];
  const headers = Object.freeze({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  const respond = (check: PaasCheck) => {
    calls.push(check);
    return Promise.resolve({ status, headers, body });
  };
  return {
    calls,
    handleLiveness: () => respond("liveness"),
    handleReadiness: () => respond("readiness"),
    handleStartup: () => respond("startup"),
  };
}

function accepts(profile: PaasProfile, status: number): boolean {
  return status >= profile.healthyStatus.min && status <= profile.healthyStatus.max;
}

const catalog = [
  fly,
  vercel,
  railway,
  render,
  cloudRun,
  koyeb,
  digitalOcean,
  azureAppService,
  azureContainerApps,
] as const;

describe("platform contracts", () => {
  test("answers healthzkit success and failure with each platform's status rule", async () => {
    for (const create of catalog) {
      const profile = create({ env: {} });
      const okKit = fakeKit(200);
      const failedKit = fakeKit(503);
      const ok = await profile.handle(okKit, { path: profile.path });
      const failed = await profile.handle(failedKit, { path: profile.path });
      expect(ok?.status, profile.id).toBe(200);
      expect(failed?.status, profile.id).toBe(503);
      expect(okKit.calls, profile.id).toEqual(["readiness"]);
      expect(failedKit.calls, profile.id).toEqual(["readiness"]);
      expect(accepts(profile, 200), profile.id).toBe(true);
      expect(accepts(profile, 503), profile.id).toBe(false);
      expect(accepts(profile, 399), profile.id).toBe(profile.healthyStatus.max === 399);
      expect(accepts(profile, 400), profile.id).toBe(false);
      expect(profile.method).toBe("GET");
      expect(profile.check).toBe("readiness");
    }
  });

  test("keeps platform defaults that decide routing and restarts", () => {
    const flyProfile = fly({ env: {} });
    expect(flyProfile).toMatchObject({
      path: "/healthz",
      continuous: true,
      restarts: false,
      probed: true,
      healthyStatus: { min: 200, max: 299 },
    });
    expect(flyProfile.timeoutMs).toBeUndefined();
    expect(flyProfile.host).toBeUndefined();

    expect(vercel({ env: {} })).toMatchObject({
      path: "/api/health",
      probed: false,
      continuous: false,
      restarts: false,
      healthyStatus: { min: 200, max: 299 },
    });

    expect(railway({ env: {} })).toMatchObject({
      path: "/health",
      host: "healthcheck.railway.app",
      continuous: false,
      restarts: false,
      probed: true,
      healthyStatus: { min: 200, max: 299 },
    });
    expect(railway({ env: {} }).timeoutMs).toBeUndefined();

    expect(render({ env: {} })).toMatchObject({
      timeoutMs: 5_000,
      continuous: true,
      restarts: true,
      healthyStatus: { min: 200, max: 399 },
    });
    expect(koyeb({ env: {} })).toMatchObject({
      timeoutMs: 5_000,
      restarts: true,
      healthyStatus: { min: 200, max: 399 },
    });
    expect(cloudRun({ env: {} })).toMatchObject({
      timeoutMs: 1_000,
      restarts: false,
      healthyStatus: { min: 200, max: 399 },
    });
    expect(digitalOcean({ env: {} })).toMatchObject({ timeoutMs: 1_000, restarts: false });
    expect(azureAppService({ env: {} })).toMatchObject({
      timeoutMs: 60_000,
      restarts: true,
      healthyStatus: { min: 200, max: 299 },
    });
    expect(azureContainerApps({ env: {} })).toMatchObject({ timeoutMs: 1_000, restarts: false });
  });

  test("marks liveness as a restart only on platforms that kill the instance", () => {
    expect(cloudRun({ check: "liveness", env: {} }).restarts).toBe(true);
    expect(cloudRun({ check: "startup", env: {} }).restarts).toBe(false);
    expect(digitalOcean({ check: "liveness", env: {} }).restarts).toBe(true);
    expect(azureContainerApps({ check: "liveness", env: {} }).restarts).toBe(true);
    expect(fly({ check: "liveness", env: {} }).restarts).toBe(false);
    expect(render({ check: "liveness", env: {} }).restarts).toBe(true);
  });
});

describe("detection and metadata", () => {
  test("detects marked platforms in catalog order and skips DigitalOcean", () => {
    const detected = detectPaas({
      CONTAINER_APP_NAME: "api",
      WEBSITE_INSTANCE_ID: "instance",
      KOYEB_SERVICE_ID: "svc",
      K_SERVICE: "api",
      RENDER: "true",
      RAILWAY_SERVICE_ID: "svc",
      VERCEL: "1",
      FLY_APP_NAME: "demo",
    });
    expect(detected.map((profile) => profile.id)).toEqual([
      "fly",
      "vercel",
      "railway",
      "render",
      "cloud-run",
      "koyeb",
      "azure-app-service",
      "azure-container-apps",
    ]);
    expect(detectPaas({}).some((profile) => profile.id === "digitalocean")).toBe(false);
  });

  test("requires the documented marker value", () => {
    expect(vercel({ env: { VERCEL: "true" } }).detected).toBe(false);
    expect(vercel({ env: { VERCEL: " 1 " } }).detected).toBe(true);
    expect(render({ env: { RENDER: "TRUE" } }).detected).toBe(false);
    expect(render({ env: { RENDER: "true" } }).detected).toBe(true);
    expect(railway({ env: { RAILWAY_ENVIRONMENT_ID: "env" } }).detected).toBe(true);
    expect(railway({ env: { RAILWAY_ENVIRONMENT: "production" } }).detected).toBe(false);
    expect(digitalOcean({ env: { DIGITALOCEAN_APP_ID: "app" } }).detected).toBe(false);
  });

  test("copies allowlisted identity and drops blanks, secrets, and huge values", () => {
    const profile = fly({
      env: {
        FLY_APP_NAME: " demo ",
        FLY_REGION: " ",
        FLY_MACHINE_ID: "d",
        FLY_PUBLIC_IP: "2600::1",
        DATABASE_URL: "postgres://secret",
        FLY_PROCESS_GROUP: "web",
      },
    });
    expect(profile.metadata).toEqual({ app: "demo", machine: "d", processGroup: "web" });
    expect(profile.detected).toBe(true);

    const huge = render({
      env: { RENDER: "true", RENDER_SERVICE_NAME: "x".repeat(257), RENDER_SERVICE_ID: "svc" },
    });
    expect(huge.detected).toBe(true);
    expect(huge.metadata).toEqual({ serviceId: "svc" });

    expect(
      vercel({
        env: {
          VERCEL: "1",
          VERCEL_ENV: "production",
          VERCEL_REGION: "iad1",
          VERCEL_URL: "preview-secret.vercel.app",
        },
      }).metadata,
    ).toEqual({ env: "production", region: "iad1" });
  });
});

describe("handler", () => {
  test("runs the selected probe for the pathname, query string, and trailing slash", async () => {
    const kit = fakeKit();
    const profile = railway({ path: "/ready/", check: "startup", env: {} });
    expect(profile.path).toBe("/ready");
    expect(profile.check).toBe("startup");

    const response = await profile.handle(kit, {
      url: "https://healthcheck.railway.app/ready/?probe=1",
      method: "get",
    });
    expect(response).toMatchObject({
      status: 200,
      body: '{"status":"ok"}',
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
    });
    expect(kit.calls).toEqual(["startup"]);
    expect(profile.matches({ path: "/ready/", method: "POST" })).toBe(true);
  });

  test("returns null for other paths and 405 without running a probe", async () => {
    const kit = fakeKit();
    const profile = render({ env: {} });
    expect(await profile.handle(kit, { path: "/healthz" })).toBeNull();
    expect(await profile.handle(kit, { path: "" })).toBeNull();
    expect(await profile.handle(kit, {})).toBeNull();
    const denied = await profile.handle(
      kit,
      new Request("http://127.0.0.1/health", { method: "POST" }),
    );
    expect(denied).toEqual({ status: 405, headers: { Allow: "GET, HEAD" }, body: "" });
    expect(kit.calls).toEqual([]);
  });

  test("HEAD keeps the status and drops the body", async () => {
    const kit = fakeKit(503, '{"status":"fail"}');
    const response = await fly({ env: {} }).handle(
      kit,
      new Request("http://127.0.0.1/healthz/", { method: "HEAD" }),
    );
    expect(response).toMatchObject({ status: 503, body: "" });
    expect(response?.headers["Cache-Control"]).toBe("no-store");
    expect(kit.calls).toEqual(["readiness"]);
  });

  test("adds Vercel cache headers without replacing the kit headers", async () => {
    const kit = fakeKit();
    const response = await vercel({ env: {} }).handle(kit, { path: "/api/health" });
    expect(response?.headers).toEqual({
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    expect(kit.calls).toEqual(["readiness"]);
  });

  test("serves the first matching profile from a fetch handler", async () => {
    const kit = createHealthKit({
      checks: [
        {
          name: "process",
          type: ["liveness", "readiness", "startup"],
          adapter: { check: async () => ({ status: "ok" }) },
        },
      ],
    });
    const handler = createPaasFetchHandler(kit, [fly({ env: {} }), railway({ env: {} })]);
    const ready = await handler(new Request("http://127.0.0.1/healthz"));
    expect(ready?.status).toBe(200);
    expect(ready?.headers.get("cache-control")).toBe("no-store");
    expect(await ready?.json()).toMatchObject({ status: "ok" });

    const head = await handler(new Request("http://127.0.0.1/health", { method: "HEAD" }));
    expect(head?.status).toBe(200);
    expect(await head?.text()).toBe("");

    expect(await handler(new Request("http://127.0.0.1/nope"))).toBeNull();
    const denied = await handler(new Request("http://127.0.0.1/healthz", { method: "PUT" }));
    expect(denied?.status).toBe(405);
    expect(denied?.headers.get("allow")).toBe("GET, HEAD");

    kit.beginDrain();
    const drained = await handlePaas(kit, railway({ env: {} }), { path: "/health" });
    expect(drained?.status).toBe(503);
    expect(accepts(railway({ env: {} }), drained?.status ?? 0)).toBe(false);
  });

  test("passes a failed readiness check through unchanged", async () => {
    const kit = createHealthKit({
      checks: [
        {
          name: "db",
          type: ["readiness"],
          adapter: { check: async () => ({ status: "fail", error: "password=secret" }) },
        },
      ],
      output: { detail: "status", exposeError: false, exposeMetadata: false },
    });
    const response = await render({ env: {} }).handle(kit, { path: "/health" });
    expect(response?.status).toBe(503);
    expect(response?.body).toBe('{"status":"fail"}');
    expect(response?.body).not.toContain("secret");
  });

  test.each([
    () => fly({ path: "health" as `/${string}`, env: {} }),
    () => fly({ path: "/health?x=1", env: {} }),
    () => fly({ path: "/health#x", env: {} }),
    () => fly({ path: "/a//b", env: {} }),
    () => fly({ path: "/health//", env: {} }),
    () => fly({ path: "/health<", env: {} }),
    () => fly({ path: "/health{", env: {} }),
    () => fly({ path: "/caf\u00e9", env: {} }),
    () => fly({ path: "/../health", env: {} }),
    () => fly({ path: "/health/../admin", env: {} }),
    () => fly({ check: "ready" as PaasCheck, env: {} }),
    () => fly(null as unknown as PaasOptions),
  ])("rejects an invalid profile option", (create) => {
    expect(create).toThrow(TypeError);
  });
});
