import { createPaasProfile, flag, pick } from "./shared.ts";
import type { PaasOptions, PaasProfile } from "./shared.ts";

/**
 * Render HTTP health check for web services.
 *
 * Serves `/health` with readiness. Render sends GET and accepts 2xx or 3xx within
 * 5 seconds. After 15 seconds of consecutive failures it stops routing to the instance.
 * After 60 seconds it restarts the instance. Private services use TCP checks only.
 * Docs: https://render.com/docs/health-checks
 */
export function render(options?: PaasOptions): PaasProfile<"render"> {
  return createPaasProfile(
    {
      id: "render",
      name: "Render",
      path: "/health",
      healthyStatus: { min: 200, max: 399 },
      timeoutMs: 5_000,
      continuous: true,
      restarts: true,
      probed: true,
      docs: "https://render.com/docs/health-checks",
      detect: (env) => flag(env, "RENDER", "true"),
      metadata: (env) =>
        pick(env, {
          service: "RENDER_SERVICE_NAME",
          serviceId: "RENDER_SERVICE_ID",
          serviceType: "RENDER_SERVICE_TYPE",
          instance: "RENDER_INSTANCE_ID",
          commit: "RENDER_GIT_COMMIT",
          branch: "RENDER_GIT_BRANCH",
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
