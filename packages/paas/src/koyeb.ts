import { createPaasProfile, pick, present } from "./shared.ts";
import type { PaasOptions, PaasProfile } from "./shared.ts";

/**
 * Koyeb HTTP health check.
 *
 * Serves `/health` with readiness. Koyeb's default TCP check does not call this
 * path; switch the port's health check to HTTP and set the path. Success is 2xx
 * or 3xx. The default timeout is 5 seconds, and the default of 3 consecutive
 * failures restarts the instance. The same check also gates startup.
 * Docs: https://www.koyeb.com/docs/run-and-scale/health-checks
 */
export function koyeb(options?: PaasOptions): PaasProfile<"koyeb"> {
  return createPaasProfile(
    {
      id: "koyeb",
      name: "Koyeb",
      path: "/health",
      healthyStatus: { min: 200, max: 399 },
      timeoutMs: 5_000,
      continuous: true,
      restarts: true,
      probed: true,
      docs: "https://www.koyeb.com/docs/run-and-scale/health-checks",
      detect: (env) => present(env, "KOYEB_SERVICE_ID"),
      metadata: (env) =>
        pick(env, {
          app: "KOYEB_APP_NAME",
          appId: "KOYEB_APP_ID",
          service: "KOYEB_SERVICE_NAME",
          serviceId: "KOYEB_SERVICE_ID",
          region: "KOYEB_REGION",
          instance: "KOYEB_INSTANCE_ID",
          replica: "KOYEB_REPLICA_INDEX",
          commit: "KOYEB_GIT_SHA",
        }),
    },
    options,
  );
}

export { createPaasFetchHandler, handlePaas } from "./shared.ts";
export type {
  PaasCheck,
  PaasEnv,
  PaasKit,
  PaasOptions,
  PaasProfile,
  PaasRequest,
  PaasResponse,
} from "./shared.ts";
