import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { httpAdapter } from "../src/http.ts";

function mockResponse(overrides: Partial<Response> = {}): Response {
  return {
    status: 200,
    statusText: "OK",
    ...overrides,
  } as Response;
}

function stubFetch(
  implementation: (
    input: string | URL,
    init?: { signal?: AbortSignal; redirect?: string },
  ) => Response | Promise<Response>,
) {
  const fetch = vi.fn(implementation);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("httpAdapter", () => {
  test("returns ok with statusCode and latencyMs for expected status", async () => {
    const fetch = stubFetch(async () => mockResponse({ status: 200 }));
    const result = await httpAdapter({ url: "https://api.example/health" }).check();

    expect(result.status).toBe("ok");
    expect(fetch).toHaveBeenCalledOnce();
    expect(result.metadata).toMatchObject({
      statusCode: 200,
      latencyMs: expect.any(Number),
    });
  });

  test("accepts 204 by default", async () => {
    stubFetch(async () => mockResponse({ status: 204, statusText: "No Content" }));
    const result = await httpAdapter({ url: "https://api.example/health" }).check();

    expect(result.status).toBe("ok");
    expect(result.metadata?.statusCode).toBe(204);
  });

  test("uses GET by default and passes headers and body", async () => {
    const fetch = stubFetch(async () => mockResponse());
    await httpAdapter({
      url: "https://api.example/probe",
      headers: { Authorization: "Bearer token" },
      body: '{"ping":true}',
      method: "POST",
    }).check();

    expect(fetch).toHaveBeenCalledWith("https://api.example/probe", {
      method: "POST",
      headers: { Authorization: "Bearer token" },
      body: '{"ping":true}',
      signal: expect.any(AbortSignal),
      redirect: "follow",
    });
  });

  test("accepts URL objects", async () => {
    const fetch = stubFetch(async () => mockResponse());
    const url = new URL("https://api.example/health");
    await httpAdapter({ url }).check();

    expect(fetch).toHaveBeenCalledWith(url, expect.objectContaining({ method: "GET" }));
  });

  test("returns fail when status is not in expectedStatusCodes", async () => {
    stubFetch(async () => mockResponse({ status: 503, statusText: "Service Unavailable" }));
    const result = await httpAdapter({ url: "https://api.example/health" }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("Unexpected status code: 503 Service Unavailable");
  });

  test("honors custom expectedStatusCodes", async () => {
    stubFetch(async () => mockResponse({ status: 301, statusText: "Moved Permanently" }));
    const result = await httpAdapter({
      url: "https://api.example/health",
      expectedStatusCodes: [301],
    }).check();

    expect(result.status).toBe("ok");
    expect(result.metadata?.statusCode).toBe(301);
  });

  test("returns fail when fetch rejects", async () => {
    stubFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    const result = await httpAdapter({ url: "https://api.example/health" }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("ECONNREFUSED");
  });

  test("returns fail with timeout message on AbortError", async () => {
    stubFetch((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    const result = await httpAdapter({
      url: "https://api.example/health",
      timeout: 10,
    }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("Request timed out after 10ms");
  });

  test("uses redirect manual when followRedirects is false", async () => {
    const fetch = stubFetch(async () => mockResponse());
    await httpAdapter({
      url: "https://api.example/health",
      followRedirects: false,
    }).check();

    expect(fetch).toHaveBeenCalledWith(
      "https://api.example/health",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  test("merges sync metadata from response", async () => {
    const response = mockResponse({ status: 200 });
    stubFetch(async () => response);

    const result = await httpAdapter({
      url: "https://api.example/health",
      metadata: (res) => {
        expect(res).toBe(response);
        return { server: "nginx" };
      },
    }).check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      server: "nginx",
      statusCode: 200,
      latencyMs: expect.any(Number),
    });
  });

  test("awaits async metadata hook", async () => {
    stubFetch(async () => mockResponse());
    const result = await httpAdapter({
      url: "https://api.example/health",
      metadata: async () => ({ region: "us-east-1" }),
    }).check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      region: "us-east-1",
      statusCode: 200,
      latencyMs: expect.any(Number),
    });
  });
});
