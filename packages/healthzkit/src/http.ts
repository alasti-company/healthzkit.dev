import type { HealthKit } from "./healthkit.ts";
import type { AgnosticResponse } from "./types.ts";

export function toFetchResponse(res: AgnosticResponse, method = "GET"): Response {
  const body = method.toUpperCase() === "HEAD" ? null : res.body;
  return new Response(body, { status: res.status, headers: res.headers });
}

export function createFetchHandler(kit: HealthKit): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    const res = await kit.handleRequest({ path, method: request.method });
    if (!res) return new Response(null, { status: 404 });
    return toFetchResponse(res, request.method);
  };
}
