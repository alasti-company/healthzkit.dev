import { describe, expect, test, vi } from "vite-plus/test";
import { httpAdapter } from "../src/index.ts";

describe("package entry (src/index.ts)", () => {
  test("re-exports httpAdapter from implementation module", async () => {
    const entry = await import("../src/index.ts");
    const impl = await import("../src/http.ts");
    expect(entry.httpAdapter).toBe(impl.httpAdapter);
  });

  test("adapter is usable from the barrel with mocked fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 200, statusText: "OK" }) as Response),
    );

    const result = await httpAdapter({ url: "https://api.example/health" }).check();

    expect(result.status).toBe("ok");
    expect(result.metadata?.statusCode).toBe(200);

    vi.unstubAllGlobals();
  });
});
