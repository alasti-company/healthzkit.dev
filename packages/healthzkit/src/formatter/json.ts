import type { HealthResponse } from "../types.ts";

export function formatJson(response: HealthResponse): string {
  return JSON.stringify(response);
}
