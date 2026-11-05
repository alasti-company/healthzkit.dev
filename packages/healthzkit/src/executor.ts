import { withTimeout } from "./timeout.ts";
import type { AdapterResult, CheckConfig } from "./types.ts";

/** One underlying adapter operation per check, scoped to a HealthKit instance. */
export class CheckExecutor {
  private inFlight = new Map<string, Promise<AdapterResult>>();

  get(name: string): Promise<AdapterResult> | undefined {
    return this.inFlight.get(name);
  }

  run(check: CheckConfig, timeoutMs: number): Promise<AdapterResult> {
    const existing = this.inFlight.get(check.name);
    if (existing) return existing;

    const controller = new AbortController();
    const pending = Promise.resolve()
      .then(() => check.adapter.check({ signal: controller.signal }))
      .finally(() => {
        // The deadline bounds the response; only settlement releases the operation.
        this.inFlight.delete(check.name);
      });
    const result = withTimeout(pending, timeoutMs, check.name, controller);
    this.inFlight.set(check.name, result);
    return result;
  }
}
