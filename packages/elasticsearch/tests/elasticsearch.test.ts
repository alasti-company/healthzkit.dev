import { describe, expect, test, vi } from "vite-plus/test";
import type { Client } from "@elastic/elasticsearch";
import { elasticsearchAdapter } from "../src/elasticsearch.ts";

type ClusterHealthResponse = Awaited<ReturnType<Client["cluster"]["health"]>>;

function mockClient(
  overrides: {
    health?: () => Promise<ClusterHealthResponse>;
  } = {},
) {
  const clusterHealth = vi.fn(
    overrides.health ??
      (async () =>
        ({
          status: "green",
          cluster_name: "es-docker-cluster",
          number_of_data_nodes: 3,
        }) as ClusterHealthResponse),
  );
  const client = {
    cluster: { health: clusterHealth },
  };
  return { client: client as unknown as Client, clusterHealth };
}

describe("src/elasticsearch.ts", () => {
  test("cluster health green maps to ok with cluster metadata", async () => {
    const { client, clusterHealth } = mockClient();
    const adapter = elasticsearchAdapter({ client });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(clusterHealth).toHaveBeenCalledOnce();
    expect(result.metadata).toMatchObject({
      clusterStatus: "green",
      clusterName: "es-docker-cluster",
      numberOfNodes: 3,
      latencyMs: expect.any(Number),
    });
  });

  test("cluster health yellow maps to degraded", async () => {
    const { client } = mockClient({
      health: async () =>
        ({
          status: "yellow",
          cluster_name: "staging",
          number_of_data_nodes: 2,
        }) as ClusterHealthResponse,
    });
    const result = await elasticsearchAdapter({ client }).check();

    expect(result.status).toBe("degraded");
    expect(result.metadata?.clusterStatus).toBe("yellow");
  });

  test("cluster health red maps to fail", async () => {
    const { client } = mockClient({
      health: async () =>
        ({
          status: "red",
          cluster_name: "prod",
          number_of_data_nodes: 5,
        }) as ClusterHealthResponse,
    });
    const result = await elasticsearchAdapter({ client }).check();

    expect(result.status).toBe("fail");
    expect(result.metadata?.clusterStatus).toBe("red");
  });

  test("returns fail when cluster.health rejects", async () => {
    const { client } = mockClient({
      health: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    const result = await elasticsearchAdapter({ client }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("ECONNREFUSED");
  });

  test("includes metadata from optional sync metadata hook", async () => {
    const { client } = mockClient();
    const adapter = elasticsearchAdapter({
      client,
      metadata: (c) => {
        expect(c).toBe(client);
        return { shards: 42 };
      },
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      shards: 42,
      latencyMs: expect.any(Number),
      clusterStatus: "green",
    });
  });

  test("includes metadata from optional async metadata hook", async () => {
    const { client } = mockClient();
    const adapter = elasticsearchAdapter({
      client,
      metadata: async (c) => {
        expect(c).toBe(client);
        return { indices: 7 };
      },
    });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      indices: 7,
      latencyMs: expect.any(Number),
    });
  });

  test("reuses injected client across checks", async () => {
    const { client, clusterHealth } = mockClient();
    const adapter = elasticsearchAdapter({ client });
    await adapter.check();
    await adapter.check();

    expect(clusterHealth).toHaveBeenCalledTimes(2);
  });

  test("creates client from config when no client is injected", async () => {
    const clusterHealth = vi.fn().mockResolvedValue({
      status: "green",
      cluster_name: "test",
      number_of_data_nodes: 1,
    });
    const Client = vi.fn(function Client(this: unknown) {
      return { cluster: { health: clusterHealth } };
    });

    vi.doMock("@elastic/elasticsearch", () => ({ Client }));

    const { elasticsearchAdapter: adapterFactory } = await import("../src/elasticsearch.ts");
    const adapter = adapterFactory({ config: { node: "http://es:9200" } });
    const result = await adapter.check();

    expect(result.status).toBe("ok");
    expect(Client).toHaveBeenCalledWith({ node: "http://es:9200" });
    expect(clusterHealth).toHaveBeenCalledOnce();

    vi.doUnmock("@elastic/elasticsearch");
  });

  test("uses default node when config is omitted", async () => {
    const clusterHealth = vi.fn().mockResolvedValue({
      status: "green",
      cluster_name: "local",
      number_of_data_nodes: 1,
    });
    const Client = vi.fn(function Client(this: unknown) {
      return { cluster: { health: clusterHealth } };
    });

    vi.doMock("@elastic/elasticsearch", () => ({ Client }));

    const { elasticsearchAdapter: adapterFactory } = await import("../src/elasticsearch.ts");
    const adapter = adapterFactory({});
    await adapter.check();

    expect(Client).toHaveBeenCalledWith({ node: "http://localhost:9200" });

    vi.doUnmock("@elastic/elasticsearch");
  });

  test("reuses a single owned client across checks", async () => {
    let constructCount = 0;
    const clusterHealth = vi.fn().mockResolvedValue({
      status: "green",
      cluster_name: "owned",
      number_of_data_nodes: 1,
    });
    const Client = vi.fn(function Client(this: unknown) {
      constructCount += 1;
      return { cluster: { health: clusterHealth } };
    });

    vi.doMock("@elastic/elasticsearch", () => ({ Client }));

    const { elasticsearchAdapter: adapterFactory } = await import("../src/elasticsearch.ts");
    const adapter = adapterFactory({ config: { node: "http://localhost:9200" } });

    await adapter.check();
    await adapter.check();

    expect(constructCount).toBe(1);
    expect(clusterHealth).toHaveBeenCalledTimes(2);

    vi.doUnmock("@elastic/elasticsearch");
  });
});
