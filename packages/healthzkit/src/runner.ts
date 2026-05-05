import type { Scheduler } from "./scheduler.ts";
import type { AdapterResult, CheckConfig, CheckResult } from "./types.ts";

const DEFAULT_TIMEOUTMS = 5_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Check "${name}" timed out after ${ms}ms`)), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

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
  scheduler: Scheduler,
  defaultTimeout: number = DEFAULT_TIMEOUTMS,
  exposeError: boolean = true,
): Promise<Record<string, CheckResult>> {
  const results = await Promise.all(
    checks.map(async (check) => {
      const timeoutMs = check.timeout ?? defaultTimeout;
      const cached = scheduler.getCache(check.name);

      let adapterResult: AdapterResult;
      let latency: number;
      let cachedAt: string | undefined;

      if (cached) {
        adapterResult = cached.result;
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
