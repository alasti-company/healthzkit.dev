import { describe, expect, test } from "vite-plus/test";
import type { Client } from "minio";
import { minioAdapter } from "../src/index.ts";

describe("package entry (src/index.ts)", () => {
  test("re-exports minioAdapter from implementation module", async () => {
    const entry = await import("../src/index.ts");
    const impl = await import("../src/minio.ts");
    expect(entry.minioAdapter).toBe(impl.minioAdapter);
  });

  test("adapter is usable from the barrel with a mock client", async () => {
    const client = {
      listBuckets: async () => [{ name: "barrel-bucket" }],
    } as unknown as Client;
    const adapter = minioAdapter({ client });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
