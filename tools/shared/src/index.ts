import type { AdapterResult, HealthAdapter } from "healthzkit";

export type MetadataFn<TClient> = (
  client: TClient,
) => Promise<Record<string, unknown>> | Record<string, unknown>;

export function buildResult(latencyMs: number, metadata?: Record<string, unknown>): AdapterResult {
  return {
    status: "ok",
    metadata: {
      ...metadata,
      latencyMs,
    },
  };
}

export function buildErrorResult(error: unknown): AdapterResult {
  return {
    status: "fail",
    error: error instanceof Error ? error : new Error(String(error)),
  };
}

export type { AdapterResult, HealthAdapter };

/** Add disposal in place, preserving identity and other members. Requires a writable check method. */
export function withDisposal<T extends HealthAdapter>(
  adapter: T,
  cleanup: () => Promise<void> | void,
): Omit<T, "check" | "dispose"> & { check: HealthAdapter["check"]; dispose(): Promise<void> } {
  const pending = new Set<Promise<AdapterResult>>();
  let closing: Promise<void> | undefined;
  const check = adapter.check.bind(adapter);
  const cleanupIsOriginal = adapter.dispose === cleanup;
  const originalDispose = adapter.dispose?.bind(adapter);
  return Object.assign(adapter, {
    check(context?: Parameters<HealthAdapter["check"]>[0]) {
      if (closing) return Promise.resolve(buildErrorResult(new Error("Adapter is disposed")));
      const operation = Promise.resolve().then(() => check(context));
      pending.add(operation);
      void operation.then(
        () => pending.delete(operation),
        () => pending.delete(operation),
      );
      return operation;
    },
    dispose() {
      closing ??= Promise.allSettled(pending).then(async () => {
        if (!originalDispose) return cleanup();
        if (cleanupIsOriginal) return originalDispose();
        const results = await Promise.allSettled([
          Promise.resolve().then(() => originalDispose()),
          Promise.resolve().then(() => cleanup()),
        ]);
        const errors = results.flatMap((result) =>
          result.status === "rejected" ? [result.reason] : [],
        );
        if (errors.length === 1) throw errors[0];
        if (errors.length) throw new AggregateError(errors, "Adapter cleanup failed");
      });
      return closing;
    },
  });
}
