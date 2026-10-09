import { createServer } from "node:http";
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

  test.each(["success", "unexpected status", "sync metadata error", "async metadata error"])(
    "cancels an unused body after %s",
    async (scenario) => {
      const cancel = vi.fn();
      const response = new Response(new ReadableStream({ cancel }), {
        status: scenario === "unexpected status" ? 503 : 200,
      });
      stubFetch(async () => response);
      const error = new Error("Metadata failed");
      const result = await httpAdapter({
        url: "https://api.example/health",
        metadata: () => {
          expect(cancel).not.toHaveBeenCalled();
          if (scenario === "sync metadata error") throw error;
          if (scenario === "async metadata error") return Promise.reject(error);
          return { server: "nginx" };
        },
      }).check();

      expect(cancel).toHaveBeenCalledOnce();
      expect(result.status).toBe(scenario === "success" ? "ok" : "fail");
      if (scenario.includes("metadata error")) expect(result.error).toBe(error);
      if (scenario === "success") expect(result.metadata?.server).toBe("nginx");
    },
  );

  test("allows metadata to consume the body before cleanup", async () => {
    const response = new Response('{"region":"us-east-1"}');
    stubFetch(async () => response);

    const result = await httpAdapter({
      url: "https://api.example/health",
      metadata: async (res) => ({ payload: await res.json() }),
    }).check();

    expect(result.status).toBe("ok");
    expect(result.metadata?.payload).toEqual({ region: "us-east-1" });
    expect(response.bodyUsed).toBe(true);
  });

  test("handles a response without a body", async () => {
    stubFetch(async () => new Response(null, { status: 204 }));
    const result = await httpAdapter({ url: "https://api.example/health" }).check();

    expect(result.status).toBe("ok");
  });

  test.each([200, 503])(
    "preserves the check result when body cancellation rejects (%s)",
    async (status) => {
      stubFetch(
        async () =>
          new Response(
            new ReadableStream({
              cancel: () => Promise.reject(new Error("Cleanup failed")),
            }),
            { status },
          ),
      );

      const result = await httpAdapter({ url: "https://api.example/health" }).check();

      expect(result.status).toBe(status === 200 ? "ok" : "fail");
      if (status === 503)
        expect((result.error as Error).message).toContain("Unexpected status code: 503");
    },
  );

  test.each(["success", "unexpected status", "metadata error", "locked body", "locked body error"])(
    "closes a streaming HTTP response after %s",
    async (scenario) => {
      let responseClosed = false;
      const server = createServer((_req, res) => {
        res.on("close", () => {
          responseClosed = true;
        });
        res.writeHead(scenario === "unexpected status" ? 503 : 200);
        res.write("stream remains open");
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

      try {
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Missing server port");
        const result = await httpAdapter({
          url: `http://127.0.0.1:${address.port}`,
          timeout: 5000,
          metadata: async (res) => {
            if (scenario.startsWith("locked body")) {
              // Leave a reader locked after reading only part of the stream.
              await res.body!.getReader().read();
            }
            if (scenario.endsWith("error")) throw new Error("Metadata failed");
            return {};
          },
        }).check();

        expect(result.status).toBe(
          scenario === "unexpected status" || scenario.endsWith("error") ? "fail" : "ok",
        );
        // Cleanup should close the response promptly, without waiting for the timeout.
        await vi.waitFor(() => expect(responseClosed).toBe(true), { timeout: 1000, interval: 10 });
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
  );
});
