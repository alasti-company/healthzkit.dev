import { createPaasProfile, pick, present } from "./shared.ts";
import type { PaasCheck, PaasOptions, PaasProfile } from "./shared.ts";

/**
 * Google Cloud Run HTTP probe.
 *
 * Serves `/health` with readiness. Cloud Run treats 2xx and 3xx as success.
 * The default probe timeout is 1 second. A failing liveness probe shuts the
 * instance down; readiness only stops new traffic. Startup must pass before
 * Cloud Run will send traffic, so keep startup as strict as readiness.
 * Docs: https://cloud.google.com/run/docs/configuring/healthchecks
 */
export function cloudRun(options?: PaasOptions): PaasProfile<"cloud-run"> {
  return createPaasProfile(
    {
      id: "cloud-run",
      name: "Google Cloud Run",
      path: "/health",
      healthyStatus: { min: 200, max: 399 },
      timeoutMs: 1_000,
      continuous: true,
      restarts: (check: PaasCheck) => check === "liveness",
      probed: true,
      docs: "https://cloud.google.com/run/docs/configuring/healthchecks",
      detect: (env) => present(env, "K_SERVICE"),
      metadata: (env) =>
        pick(env, {
          service: "K_SERVICE",
          revision: "K_REVISION",
          configuration: "K_CONFIGURATION",
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
