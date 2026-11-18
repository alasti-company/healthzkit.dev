import { createPaasProfile, pick, present } from "./shared.ts";
import type { PaasOptions, PaasProfile } from "./shared.ts";

/**
 * Railway deploy healthcheck.
 *
 * Serves `/health` with readiness. Railway requests it only during deploy and
 * accepts any 2xx before switching traffic. The Host header is `healthcheck.railway.app`.
 * The default deploy window is 300 seconds (`RAILWAY_HEALTHCHECK_TIMEOUT_SEC`).
 * Docs: https://docs.railway.com/deployments/healthchecks
 */
export function railway(options?: PaasOptions): PaasProfile<"railway"> {
  return createPaasProfile(
    {
      id: "railway",
      name: "Railway",
      path: "/health",
      healthyStatus: { min: 200, max: 299 },
      continuous: false,
      restarts: false,
      probed: true,
      host: "healthcheck.railway.app",
      docs: "https://docs.railway.com/deployments/healthchecks",
      detect: (env) =>
        present(env, "RAILWAY_PROJECT_ID") ||
        present(env, "RAILWAY_SERVICE_ID") ||
        present(env, "RAILWAY_ENVIRONMENT_ID"),
      metadata: (env) =>
        pick(env, {
          environment: "RAILWAY_ENVIRONMENT_NAME",
          project: "RAILWAY_PROJECT_NAME",
          projectId: "RAILWAY_PROJECT_ID",
          service: "RAILWAY_SERVICE_NAME",
          serviceId: "RAILWAY_SERVICE_ID",
          replica: "RAILWAY_REPLICA_ID",
          region: "RAILWAY_REPLICA_REGION",
          deployment: "RAILWAY_DEPLOYMENT_ID",
          commit: "RAILWAY_GIT_COMMIT_SHA",
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
