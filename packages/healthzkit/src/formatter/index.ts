import type { HealthResponse, OutputFormat } from "../types.ts";
import { formatJson } from "./json.ts";
import { formatText } from "./text.ts";

export function format(response: HealthResponse, outputFormat: OutputFormat = "json") {
  switch (outputFormat) {
    case "text":
      return {
        body: formatText(response),
        contentType: "text/plain",
      };
    case "json":
    default:
      return {
        body: formatJson(response),
        contentType: "application/json",
      };
  }
}
