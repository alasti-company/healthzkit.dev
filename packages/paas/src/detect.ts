import { azureAppService } from "./azure-app-service.ts";
import { azureContainerApps } from "./azure-container-apps.ts";
import { cloudRun } from "./cloud-run.ts";
import { digitalOcean } from "./digitalocean.ts";
import { fly } from "./fly.ts";
import { koyeb } from "./koyeb.ts";
import { railway } from "./railway.ts";
import { render } from "./render.ts";
import { vercel } from "./vercel.ts";
import type { PaasEnv, PaasProfile } from "./shared.ts";

const createPlatform = [
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

/** Profiles whose runtime marker is present, in catalog order. */
export function detectPaas(env?: PaasEnv): PaasProfile[] {
  const options = env ? { env } : undefined;
  return createPlatform.flatMap((create) => {
    const profile = create(options);
    return profile.detected ? [profile] : [];
  });
}
