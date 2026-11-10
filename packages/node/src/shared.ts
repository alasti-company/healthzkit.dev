export { buildErrorResult, withDisposal } from "@healthzkit/shared";
export type { HealthAdapter, AdapterResult } from "healthzkit";

export function positive(value: number, name: string, integer = false): void {
  if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isSafeInteger(value))) {
    throw new RangeError(
      `${name} must be a finite positive ${integer ? "safe integer" : "number"}`,
    );
  }
}
