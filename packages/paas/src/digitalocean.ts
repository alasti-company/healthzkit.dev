import { createPaasProfile } from "./shared.ts";
import type { PaasCheck, PaasOptions, PaasProfile } from "./shared.ts";

/**
 * DigitalOcean App Platform HTTP health check.
 *
 * Serves `/health` with readiness (`health_check` in the app spec). App Platform
 * uses TCP until `http_path` is set. HTTP success is 200 through 399. The default
 * `timeout_seconds` is 1. `liveness_health_check` restarts the component; pass
 * `check: "liveness"` only for that probe. App Platform does not publish a runtime
 * marker this package recognizes, so `detected` stays false.
 * Docs: https://docs.digitalocean.com/products/app-platform/reference/app-spec/
 */
export function digitalOcean(options?: PaasOptions): PaasProfile<"digitalocean"> {
  return createPaasProfile(
    {
      id: "digitalocean",
      name: "DigitalOcean App Platform",
      path: "/health",
      healthyStatus: { min: 200, max: 399 },
      timeoutMs: 1_000,
      continuous: true,
      restarts: (check: PaasCheck) => check === "liveness",
      probed: true,
      docs: "https://docs.digitalocean.com/products/app-platform/reference/app-spec/",
      detect: () => false,
      metadata: () => ({}),
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
