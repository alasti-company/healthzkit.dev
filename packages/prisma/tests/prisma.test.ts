import { describe, expect, test, vi } from "vite-plus/test";
import { prismaAdapter } from "../src/prisma.ts";

function mockPrismaClient(
  overrides: {
    $connect?: () => Promise<void>;
    $queryRawUnsafe?: (query: string) => Promise<unknown>;
  } = {},
) {
  const $connect = vi.fn(overrides.$connect ?? (async () => undefined));
  const $queryRawUnsafe = vi.fn(overrides.$queryRawUnsafe ?? (async () => []));
  return { $connect, $queryRawUnsafe };
}

describe("prismaAdapter", () => {
  test("connects, runs default query, and returns ok with latency metadata", async () => {
    const client = mockPrismaClient();
    const result = await prismaAdapter({ client: client as never }).check();

    expect(result.status).toBe("ok");
    expect(client.$connect).toHaveBeenCalledOnce();
    expect(client.$queryRawUnsafe).toHaveBeenCalledWith("SELECT 1");
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("uses custom query when provided", async () => {
    const client = mockPrismaClient();
    await prismaAdapter({ client: client as never, query: "SELECT current_database()" }).check();

    expect(client.$queryRawUnsafe).toHaveBeenCalledWith("SELECT current_database()");
  });

  test("returns fail when $connect rejects", async () => {
    const client = mockPrismaClient({
      $connect: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    const result = await prismaAdapter({ client: client as never }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("ECONNREFUSED");
    expect(client.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  test("returns fail when $queryRawUnsafe rejects", async () => {
    const client = mockPrismaClient({
      $queryRawUnsafe: async () => {
        throw new Error("permission denied");
      },
    });
    const result = await prismaAdapter({ client: client as never }).check();

    expect(result.status).toBe("fail");
    expect((result.error as Error).message).toBe("permission denied");
  });

  test("includes sync metadata from the client", async () => {
    const client = { ...mockPrismaClient(), schema: "public" };
    const result = await prismaAdapter({
      client: client as never,
      metadata: (c) => ({ schema: (c as unknown as { schema: string }).schema }),
    }).check();

    expect(result.status).toBe("ok");
    expect(result.metadata?.schema).toBe("public");
    expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("includes async metadata from the client", async () => {
    const client = { ...mockPrismaClient(), schema: "public" };
    const result = await prismaAdapter({
      client: client as never,
      metadata: async (c) => ({ schema: (c as unknown as { schema: string }).schema }),
    }).check();

    expect(result.status).toBe("ok");
    expect(result.metadata?.schema).toBe("public");
  });
});
