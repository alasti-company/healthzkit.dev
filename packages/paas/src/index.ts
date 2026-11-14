export { azureAppService } from "./azure-app-service.ts";
export { azureContainerApps } from "./azure-container-apps.ts";
export { cloudRun } from "./cloud-run.ts";
export { detectPaas } from "./detect.ts";
export { digitalOcean } from "./digitalocean.ts";
export { fly } from "./fly.ts";
export { koyeb } from "./koyeb.ts";
export { railway } from "./railway.ts";
export { render } from "./render.ts";
export { vercel } from "./vercel.ts";
export { createPaasFetchHandler, handlePaas } from "./shared.ts";
export type {
  PaasCheck,
  PaasEnv,
  PaasId,
  PaasKit,
  PaasOptions,
  PaasProfile,
  PaasRequest,
  PaasResponse,
} from "./shared.ts";
