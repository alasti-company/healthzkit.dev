export const DEFAULT_TIMEOUTMS = 5_000;
/** Largest delay setTimeout and setInterval accept without 32-bit overflow. */
export const MAX_TIMER_MS = 2_147_483_647;

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  name: string,
  controller?: AbortController,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Check "${name}" timed out after ${ms}ms`);
      reject(error);
      controller?.abort(error);
    }, ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
