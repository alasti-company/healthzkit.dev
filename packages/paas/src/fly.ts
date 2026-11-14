import { createPaasProfile, pick, present } from "./shared.ts";
import type { PaasOptions, PaasProfile } from "./shared.ts";

/**
 * Fly.io HTTP service check.
 *
 * Serves `/healthz` with readiness. Fly treats 2xx as healthy, does not follow
 * redirects, and stops routing to a failing Machine. A failing check does not restart it.
 * Docs: https://docs.fly.io/reference/health-checks/
 */
export function fly(options?: PaasOptions): PaasProfile<"fly"> {
  return createPaasProfile(
    {
      id: "fly",
      name: "Fly.io",
      path: "/healthz",
      healthyStatus: { min: 200, max: 299 },
      continuous: true,
      restarts: false,
      probed: true,
      docs: "https://docs.fly.io/reference/health-checks/",
      detect: (env) => present(env, "FLY_APP_NAME"),
      metadata: (env) =>
        pick(env, {
          app: "FLY_APP_NAME",
          region: "FLY_REGION",
          machine: "FLY_MACHINE_ID",
          processGroup: "FLY_PROCESS_GROUP",
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
