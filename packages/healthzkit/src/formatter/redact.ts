import type { HealthResponse, OutputConfig } from "../types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isScalar(value: unknown): boolean {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

/** Copy only explicitly selected own scalar leaves; never serialize source objects. */
function allowMetadata(metadata: Record<string, unknown>, paths: readonly string[]) {
  const selected: Record<string, unknown> = Object.create(null);
  for (const path of paths) {
    if (!path.startsWith("/") || /~(?![01])/.test(path)) continue;
    const parts = path
      .slice(1)
      .split("/")
      .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
    if (parts.some((part) => ["__proto__", "prototype", "constructor", "toJSON"].includes(part))) {
      continue;
    }
    let value: unknown = metadata;
    for (const part of parts) {
      if (!isRecord(value)) {
        value = undefined;
        break;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, part);
      // Accessors and inherited properties must not execute during public serialization.
      value = descriptor && "value" in descriptor ? descriptor.value : undefined;
    }
    if (!isScalar(value)) continue;
    let target = selected;
    for (const part of parts.slice(0, -1)) {
      target[part] ??= Object.create(null);
      target = target[part] as Record<string, unknown>;
    }
    target[parts[parts.length - 1]!] = value;
  }
  return Object.keys(selected).length ? selected : undefined;
}

function safeAllowMetadata(metadata: Record<string, unknown>, paths: readonly string[]) {
  try {
    return allowMetadata(metadata, paths);
  } catch {
    // Uninspectable metadata (including throwing Proxy traps) must fail closed.
    return undefined;
  }
}

/** Output projection only: runner results, scheduler cache, and rollups retain diagnostics. */
export function redactResponse(response: HealthResponse, output: OutputConfig): HealthResponse {
  return {
    ...response,
    checks: Object.fromEntries(
      Object.entries(response.checks).map(([name, result]) => {
        const { error, metadata, ...rest } = result;
        const publicMetadata =
          output.exposeMetadata === false
            ? undefined
            : Array.isArray(output.exposeMetadata)
              ? metadata && safeAllowMetadata(metadata, output.exposeMetadata)
              : metadata;
        return [
          name,
          {
            ...rest,
            ...(output.exposeError !== false && error !== undefined && { error }),
            ...(publicMetadata !== undefined && { metadata: publicMetadata }),
          },
        ];
      }),
    ),
  };
}
