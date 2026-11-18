import { createPaasProfile, pick, present } from "./shared.ts";
import type { PaasCheck, PaasOptions, PaasProfile } from "./shared.ts";

/**
 * Azure Container Apps HTTP probe.
 *
 * Serves `/health` with readiness. Container Apps treats 200 through 399 as
 * success. The default probe timeout is 1 second. A failing liveness probe
 * restarts the replica; readiness stops new traffic until the probe passes again.
 * Docs: https://learn.microsoft.com/en-us/azure/container-apps/health-probes
 */
export function azureContainerApps(options?: PaasOptions): PaasProfile<"azure-container-apps"> {
  return createPaasProfile(
    {
      id: "azure-container-apps",
      name: "Azure Container Apps",
      path: "/health",
      healthyStatus: { min: 200, max: 399 },
      timeoutMs: 1_000,
      continuous: true,
      restarts: (check: PaasCheck) => check === "liveness",
      probed: true,
      docs: "https://learn.microsoft.com/en-us/azure/container-apps/health-probes",
      detect: (env) => present(env, "CONTAINER_APP_NAME"),
      metadata: (env) =>
        pick(env, {
          app: "CONTAINER_APP_NAME",
          revision: "CONTAINER_APP_REVISION",
          replica: "CONTAINER_APP_REPLICA_NAME",
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
