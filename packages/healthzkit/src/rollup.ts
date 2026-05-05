import type { CheckResult, CheckStatus, RollupConfig } from "./types.ts";

const defaultComputeStatus = (results: Record<string, CheckResult>): CheckStatus => {
  const statuses = Object.values(results).map((r) => r.status);

  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("degraded")) return "degraded";
  return "ok";
};

export function computeRollupStatus(
  results: Record<string, CheckResult>,
  config?: RollupConfig,
): CheckStatus {
  const fn = config?.computeStatus ?? defaultComputeStatus;
  return fn(results);
}
