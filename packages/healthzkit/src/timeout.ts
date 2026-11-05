export const DEFAULT_TIMEOUTMS = 5_000;

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
