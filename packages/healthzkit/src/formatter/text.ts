import type { HealthResponse } from "../types.ts";

export function formatText(response: HealthResponse): string {
  const lines: string[] = [`status: ${response.status}`];
  for (const [name, result] of Object.entries(response.checks)) {
    let line = `${name}: ${result.status} (${result.latency}ms)`;
    if (result.error) line += ` - ${result.error}`;
    lines.push(line);
  }

  return lines.join("\n");
}
