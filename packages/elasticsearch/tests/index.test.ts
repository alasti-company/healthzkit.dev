import { describe, expect, test } from "vite-plus/test";
import type { Client } from "@elastic/elasticsearch";
import { elasticsearchAdapter } from "../src/index.ts";

describe("package entry (src/index.ts)", () => {
  test("re-exports elasticsearchAdapter from implementation module", async () => {
    const entry = await import("../src/index.ts");
    const impl = await import("../src/elasticsearch.ts");
    expect(entry.elasticsearchAdapter).toBe(impl.elasticsearchAdapter);
  });

  test("adapter is usable from the barrel with a mock client", async () => {
    const client = {
      cluster: {
        health: async () => ({
          status: "green",
          cluster_name: "barrel",
          number_of_data_nodes: 1,
        }),
      },
    } as unknown as Client;
    const adapter = elasticsearchAdapter({ client });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata?.clusterName).toBe("barrel");
  });
});
