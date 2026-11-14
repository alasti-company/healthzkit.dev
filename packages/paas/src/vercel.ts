import { createPaasProfile, flag, pick } from "./shared.ts";
import type { PaasOptions, PaasProfile } from "./shared.ts";

/**
 * Vercel health route.
 *
 * Vercel does not send a platform health probe. This serves `/api/health` with
 * readiness for uptime monitors and adds CDN cache headers on top of healthzkit's
 * `Cache-Control: no-store`. Skip `kit.start()` on serverless; run checks per request.
 * Docs: https://vercel.com/docs/headers/cache-control-headers
 */
export function vercel(options?: PaasOptions): PaasProfile<"vercel"> {
  return createPaasProfile(
    {
      id: "vercel",
      name: "Vercel",
      path: "/api/health",
      healthyStatus: { min: 200, max: 299 },
      continuous: false,
      restarts: false,
      probed: false,
      docs: "https://vercel.com/docs/headers/cache-control-headers",
      headers: {
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
      },
      detect: (env) => flag(env, "VERCEL", "1"),
      metadata: (env) =>
        pick(env, {
          env: "VERCEL_ENV",
          region: "VERCEL_REGION",
          deployment: "VERCEL_DEPLOYMENT_ID",
          project: "VERCEL_PROJECT_ID",
          commit: "VERCEL_GIT_COMMIT_SHA",
          ref: "VERCEL_GIT_COMMIT_REF",
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
