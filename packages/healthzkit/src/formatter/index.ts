import type { HealthResponse, OutputConfig, OutputFormat } from "../types.ts";
import { redactResponse } from "./redact.ts";
import { formatJson } from "./json.ts";
import { formatText } from "./text.ts";

export function format(
  response: HealthResponse,
  outputFormat: OutputFormat = "json",
  output: OutputConfig = {},
) {
  if (output.detail === "status") {
    return outputFormat === "text"
      ? { body: `status: ${response.status}`, contentType: "text/plain" }
      : { body: JSON.stringify({ status: response.status }), contentType: "application/json" };
  }
  const publicResponse = redactResponse(response, output);
  switch (outputFormat) {
    case "text":
      return {
        body: formatText(publicResponse),
        contentType: "text/plain",
      };
    case "json":
    default:
      return {
        body: formatJson(publicResponse),
        contentType: "application/json",
      };
  }
}
