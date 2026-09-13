import type { HealthKit } from "./healthkit.ts";
import type { AgnosticResponse } from "./types.ts";

export function toFetchResponse(res: AgnosticResponse, method = "GET"): Response {
  const body = method.toUpperCase() === "HEAD" ? null : res.body;
  return new Response(body, { status: res.status, headers: res.headers });
}

const allowGetHead = { allow: "GET, HEAD" };

export function createFetchHandler(kit: HealthKit): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const method = request.method.toUpperCase();
    const path = new URL(request.url).pathname;
    if (method !== "GET" && method !== "HEAD") {
      if (!kit.matchHealthPath(path)) return new Response(null, { status: 404 });
      return new Response(null, { status: 405, headers: allowGetHead });
    }
    const res = await kit.handleRequest({ path, method });
    if (!res) return new Response(null, { status: 404 });
    return toFetchResponse(res, method);
  };
}
