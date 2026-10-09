import type { Scheduler } from "./scheduler.ts";
import { DEFAULT_TIMEOUTMS, withTimeout } from "./timeout.ts";
import type { AdapterResult, CheckConfig, CheckResult } from "./types.ts";

async function executeCheck(
  check: CheckConfig,
  timeoutMs: number,
): Promise<{ result: AdapterResult; latency: number }> {
  const start = Date.now();

  try {
    const result = await withTimeout(check.adapter.check(), timeoutMs, check.name);

    return { result, latency: Date.now() - start };
  } catch (error) {
    return {
      result: {
        status: "fail",
        error: error instanceof Error ? error : new Error(String(error)),
      },
      latency: Date.now() - start,
    };
  }
}

export async function runChecks(
  checks: CheckConfig[],
  scheduler: Pick<Scheduler, "getCache" | "getPending">,
  defaultTimeout: number = DEFAULT_TIMEOUTMS,
  exposeError: boolean = true,
): Promise<Record<string, CheckResult>> {
  const results = await Promise.all(
    checks.map(async (check) => {
      const timeoutMs = check.timeout ?? defaultTimeout;
      const cached = scheduler.getCache(check.name) ?? (await scheduler.getPending(check.name));

      let adapterResult: AdapterResult;
      let latency: number;
      let cachedAt: string | undefined;

      if (cached) {
        const maxAgeMs = check.schedule ? check.schedule.intervalMs + timeoutMs : undefined;
        adapterResult =
          maxAgeMs !== undefined && Date.now() - cached.cachedAt.getTime() >= maxAgeMs
            ? {
                status: "fail",
                error: new Error(
                  `Check "${check.name}" cached result is stale after ${maxAgeMs}ms`,
                ),
              }
            : cached.result;
        latency = 0;
        cachedAt = cached.cachedAt.toISOString();
      } else {
        ({ result: adapterResult, latency } = await executeCheck(check, timeoutMs));
      }

      const status =
        adapterResult.status === "fail" && check.onFail?.treatAs
          ? check.onFail.treatAs
          : adapterResult.status;
      const errorMessage =
        adapterResult.error instanceof Error ? adapterResult.error.message : adapterResult.error;
      const checkResult: CheckResult = {
        status,
        latency,
        ...(adapterResult.metadata && { metadata: adapterResult.metadata }),
        ...(cachedAt && { cachedAt }),
        ...(exposeError && errorMessage && { error: errorMessage }),
      };

      return [check.name, checkResult] as const;
    }),
  );

  return Object.fromEntries(results);
}
