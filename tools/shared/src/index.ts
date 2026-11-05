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

/** Add terminal, idempotent disposal while retaining checks already in progress. */
export function withDisposal<T extends HealthAdapter>(
  adapter: T,
  cleanup: () => Promise<void> | void,
): T & { dispose(): Promise<void> } {
  const pending = new Set<Promise<AdapterResult>>();
  let closing: Promise<void> | undefined;
  return {
    ...adapter,
    check(context) {
      if (closing) return Promise.resolve(buildErrorResult(new Error("Adapter is disposed")));
      const operation = Promise.resolve().then(() => adapter.check(context));
      pending.add(operation);
      void operation.then(
        () => pending.delete(operation),
        () => pending.delete(operation),
      );
      return operation;
    },
    dispose() {
      closing ??= Promise.allSettled(pending).then(() => cleanup());
      return closing;
    },
  };
}
