export type PaasId =
  | "fly"
  | "vercel"
  | "railway"
  | "render"
  | "cloud-run"
  | "koyeb"
  | "digitalocean"
  | "azure-app-service"
  | "azure-container-apps";

export type PaasCheck = "liveness" | "readiness" | "startup";

/** Process environment, or a test double. Values may be absent. */
export type PaasEnv = Readonly<Record<string, string | undefined>>;

export interface PaasOptions {
  /**
   * Pathname the platform requests. Must start with `/`.
   * A trailing slash is removed, except for `/`.
   */
  path?: `/${string}`;
  /** Probe that answers the platform path. Defaults to the platform's probe. */
  check?: PaasCheck;
  /** Environment to read. Defaults to `process.env` when the process exists. */
  env?: PaasEnv;
}

export interface PaasRequest {
  /** Pathname, or an absolute URL whose pathname is used. */
  path?: string;
  /** Absolute URL, used when `path` is absent. */
  url?: string;
  /** Defaults to GET. */
  method?: string;
}

export interface PaasResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Structural slice of HealthKit. A real `HealthKit` satisfies it. */
export interface PaasKit {
  handleLiveness(): Promise<PaasResponse>;
  handleReadiness(): Promise<PaasResponse>;
  handleStartup(): Promise<PaasResponse>;
}

export interface PaasProfile<Id extends PaasId = PaasId> {
  readonly id: Id;
  readonly name: string;
  /** Canonical pathname to configure on the platform and to serve. */
  readonly path: string;
  readonly check: PaasCheck;
  /** Method the platform sends. The handler also accepts HEAD. */
  readonly method: "GET";
  /** Inclusive HTTP statuses the platform treats as healthy. */
  readonly healthyStatus: { readonly min: number; readonly max: number };
  /** Platform wait for one response, when that limit is fixed or has a default. */
  readonly timeoutMs?: number;
  /** Platform keeps requesting the path after the deploy is live. */
  readonly continuous: boolean;
  /** Platform restarts or replaces the instance when the path keeps failing. */
  readonly restarts: boolean;
  /** Platform itself requests this path. Vercel does not. */
  readonly probed: boolean;
  /** Host header the platform sends, when that host is fixed. */
  readonly host?: string;
  /** True when `env` looks like this platform. */
  readonly detected: boolean;
  /**
   * Non-secret runtime identity for logs. Absent values are omitted.
   * This is not copied into the HTTP body.
   */
  readonly metadata: Readonly<Record<string, string>>;
  readonly docs: string;
  /** True when the pathname is this profile's path. The method is ignored. */
  matches(input: PaasRequest | Request): boolean;
  /**
   * Run the mapped probe when the pathname matches.
   * Returns null for any other pathname. GET and HEAD run the probe.
   * Any other method on this pathname returns 405.
   */
  handle(kit: PaasKit, input: PaasRequest | Request): Promise<PaasResponse | null>;
}

interface PaasDefinition<Id extends PaasId> {
  id: Id;
  name: string;
  path: string;
  check?: PaasCheck;
  healthyStatus: { min: number; max: number };
  timeoutMs?: number;
  continuous: boolean;
  restarts: boolean | ((check: PaasCheck) => boolean);
  probed: boolean;
  host?: string;
  docs: string;
  headers?: Readonly<Record<string, string>>;
  detect: (env: PaasEnv) => boolean;
  metadata: (env: PaasEnv) => Record<string, string>;
}

const CHECKS: readonly PaasCheck[] = ["liveness", "readiness", "startup"];
const MAX_PATH = 2048;
const MAX_METADATA = 256;
const MAX_TIMER_MS = 2_147_483_647;

function readEnv(env: PaasEnv, key: string): string | undefined {
  const value = env[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_METADATA) return undefined;
  return trimmed;
}

export function present(env: PaasEnv, key: string): boolean {
  const value = env[key];
  return typeof value === "string" && value.trim().length > 0;
}

export function flag(env: PaasEnv, key: string, expected: string): boolean {
  const value = env[key];
  return typeof value === "string" && value.trim() === expected;
}

export function pick(
  env: PaasEnv,
  fields: Readonly<Record<string, string>>,
): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const [name, key] of Object.entries(fields)) {
    const value = readEnv(env, key);
    if (value) metadata[name] = value;
  }
  return metadata;
}

function assertCheck(check: PaasCheck): PaasCheck {
  if (!CHECKS.includes(check)) throw new TypeError("check must be liveness, readiness, or startup");
  return check;
}

function canonicalPath(path: string): string {
  if (typeof path !== "string") throw new TypeError("path must be a string");
  if (path.length === 0 || path.length > MAX_PATH) {
    throw new TypeError(`path must be 1 to ${MAX_PATH} characters`);
  }
  if (!path.startsWith("/")) throw new TypeError("path must start with /");
  if (/[?#\\\s%]/.test(path)) {
    throw new TypeError("path must be a pathname without a query, hash, or percent-encoding");
  }
  const canonical = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  if (canonical.includes("//")) throw new TypeError("path must not contain empty segments");
  if (canonical.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new TypeError("path must not contain . or .. segments");
  }
  return canonical;
}

function defaultEnv(env: PaasEnv | undefined): PaasEnv {
  if (env) return env;
  if (typeof process !== "undefined" && process.env) return process.env;
  return {};
}

function isRequest(input: PaasRequest | Request): input is Request {
  return typeof Request !== "undefined" && input instanceof Request;
}

function requestPathname(raw: string): string | undefined {
  try {
    const pathname = new URL(raw, "http://127.0.0.1").pathname;
    if (!pathname.startsWith("/")) return undefined;
    return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  } catch {
    return undefined;
  }
}

interface NormalizedRequest {
  path: string;
  method: string;
}

function normalize(input: PaasRequest | Request): NormalizedRequest | undefined {
  let raw: string | undefined;
  let method = "GET";
  if (isRequest(input)) {
    raw = input.url;
    if (input.method) method = input.method;
  } else if (input && typeof input === "object") {
    if (typeof input.path === "string" && input.path.length > 0) raw = input.path;
    else if (typeof input.url === "string" && input.url.length > 0) raw = input.url;
    if (typeof input.method === "string" && input.method.trim()) method = input.method;
  }
  if (!raw) return undefined;
  const path = requestPathname(raw);
  if (!path) return undefined;
  return { path, method: method.trim().toUpperCase() };
}

function assertRange(range: { min: number; max: number }): {
  readonly min: number;
  readonly max: number;
} {
  if (
    !Number.isInteger(range.min) ||
    !Number.isInteger(range.max) ||
    range.min < 200 ||
    range.max > 399 ||
    range.min > range.max
  ) {
    throw new RangeError("healthyStatus must be an inclusive range from 200 through 399");
  }
  return Object.freeze({ min: range.min, max: range.max });
}

export function createPaasProfile<Id extends PaasId>(
  definition: PaasDefinition<Id>,
  options?: PaasOptions,
): PaasProfile<Id> {
  if (options !== undefined && (options === null || typeof options !== "object")) {
    throw new TypeError("options must be an object");
  }
  const path = canonicalPath(options?.path ?? definition.path);
  const check = assertCheck(options?.check ?? definition.check ?? "readiness");
  const env = defaultEnv(options?.env);
  const timeoutMs = definition.timeoutMs;
  if (
    timeoutMs !== undefined &&
    (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMER_MS)
  ) {
    throw new RangeError("timeoutMs must be an integer between 1 and 2147483647");
  }
  if (definition.host !== undefined && !/^[a-z0-9.-]+$/i.test(definition.host)) {
    throw new TypeError("host must be a hostname");
  }
  const extraHeaders = Object.freeze({ ...definition.headers });
  const restarts =
    typeof definition.restarts === "function" ? definition.restarts(check) : definition.restarts;
  const run =
    check === "liveness"
      ? (kit: PaasKit) => kit.handleLiveness()
      : check === "startup"
        ? (kit: PaasKit) => kit.handleStartup()
        : (kit: PaasKit) => kit.handleReadiness();

  return Object.freeze({
    id: definition.id,
    name: definition.name,
    path,
    check,
    method: "GET" as const,
    healthyStatus: assertRange(definition.healthyStatus),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    continuous: definition.continuous,
    restarts,
    probed: definition.probed,
    ...(definition.host === undefined ? {} : { host: definition.host }),
    detected: definition.detect(env),
    metadata: Object.freeze(definition.metadata(env)),
    docs: definition.docs,
    matches(input: PaasRequest | Request): boolean {
      return normalize(input)?.path === path;
    },
    async handle(kit: PaasKit, input: PaasRequest | Request): Promise<PaasResponse | null> {
      const request = normalize(input);
      if (!request || request.path !== path) return null;
      if (request.method !== "GET" && request.method !== "HEAD") {
        return { status: 405, headers: { Allow: "GET, HEAD" }, body: "" };
      }
      const response = await run(kit);
      return {
        status: response.status,
        headers: { ...extraHeaders, ...response.headers },
        body: request.method === "HEAD" ? "" : response.body,
      };
    },
  });
}

export async function handlePaas(
  kit: PaasKit,
  profiles: PaasProfile | readonly PaasProfile[],
  input: PaasRequest | Request,
): Promise<PaasResponse | null> {
  const list = Array.isArray(profiles) ? profiles : [profiles];
  for (const profile of list) {
    const response = await profile.handle(kit, input);
    if (response) return response;
  }
  return null;
}

export function createPaasFetchHandler(
  kit: PaasKit,
  profiles: PaasProfile | readonly PaasProfile[],
): (request: Request) => Promise<Response | null> {
  return async (request) => {
    const response = await handlePaas(kit, profiles, request);
    if (!response) return null;
    const body = request.method.toUpperCase() === "HEAD" ? null : response.body;
    return new Response(body, { status: response.status, headers: response.headers });
  };
}
