import type { CachedResult, Scheduler } from "./scheduler.ts";
import { DEFAULT_TIMEOUTMS } from "./timeout.ts";
import type { AdapterResult, CheckConfig, CheckResult } from "./types.ts";

type ScheduledRunner = Pick<Scheduler, "getCache" | "getPending" | "runCheck"> & {
  prepareScheduled?(check: CheckConfig, timeoutMs: number): Promise<CachedResult> | undefined;
};

async function executeCheck(
  check: CheckConfig,
  timeoutMs: number,
  scheduler: Pick<Scheduler, "runCheck">,
): Promise<{ result: AdapterResult; latency: number }> {
  const start = Date.now();

  try {
    const result = await scheduler.runCheck(check, timeoutMs);

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
  scheduler: ScheduledRunner,
  defaultTimeout: number = DEFAULT_TIMEOUTMS,
  exposeError: boolean = true,
): Promise<Record<string, CheckResult>> {
  const results = await Promise.all(
    checks.map(async (check) => {
      const timeoutMs = check.timeout ?? defaultTimeout;
      const cachedHit = scheduler.getCache(check.name);
      // A cache hit must not cancel a refresh delay. Promotion is only for the
      // initial wait, when a probe would otherwise block on jitter.
      const scheduled = cachedHit
        ? undefined
        : scheduler.prepareScheduled
          ? scheduler.prepareScheduled(check, timeoutMs)
          : scheduler.getPending(check.name);
      const cached = cachedHit ?? (scheduled ? await scheduled : undefined);

      let adapterResult: AdapterResult;
      let latency: number;
      let cachedAt: string | undefined;

      if (cached) {
        const maxAgeMs = check.schedule
          ? check.schedule.intervalMs + (check.schedule.jitterMs ?? 0) + timeoutMs
          : undefined;
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
        ({ result: adapterResult, latency } = await executeCheck(check, timeoutMs, scheduler));
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
