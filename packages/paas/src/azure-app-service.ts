import { createPaasProfile, pick, present } from "./shared.ts";
import type { PaasOptions, PaasProfile } from "./shared.ts";

/**
 * Azure App Service Health check.
 *
 * Serves `/health` with readiness. App Service has no default path; set the same
 * path in the portal. It accepts 200 through 299, pings about once a minute, and
 * treats a response slower than one minute as failed. It does not follow redirects.
 * An instance that stays unhealthy for one hour can be replaced.
 * Docs: https://learn.microsoft.com/en-us/azure/app-service/monitor-instances-health-check
 */
export function azureAppService(options?: PaasOptions): PaasProfile<"azure-app-service"> {
  return createPaasProfile(
    {
      id: "azure-app-service",
      name: "Azure App Service",
      path: "/health",
      healthyStatus: { min: 200, max: 299 },
      timeoutMs: 60_000,
      continuous: true,
      restarts: true,
      probed: true,
      docs: "https://learn.microsoft.com/en-us/azure/app-service/monitor-instances-health-check",
      detect: (env) => present(env, "WEBSITE_INSTANCE_ID"),
      metadata: (env) =>
        pick(env, {
          site: "WEBSITE_SITE_NAME",
          instance: "WEBSITE_INSTANCE_ID",
          hostname: "WEBSITE_HOSTNAME",
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
