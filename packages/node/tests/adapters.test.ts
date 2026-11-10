import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { memoryUsage } from "node:process";
import { statfs } from "node:fs/promises";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { memoryAdapter, diskAdapter, eventLoopAdapter } from "../src/index.ts";

const rss = vi.hoisted(() => vi.fn());

vi.mock("node:process", () => ({ memoryUsage: Object.assign(vi.fn(), { rss }) }));
vi.mock("node:fs/promises", () => ({ statfs: vi.fn() }));
vi.mock("node:perf_hooks", () => ({
  performance: { now: () => Date.now() },
  monitorEventLoopDelay: vi.fn(),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("memory", () => {
  it("uses an inclusive RSS byte budget and selects heap explicitly", async () => {
    rss.mockReturnValue(100);
    const adapter = memoryAdapter({ maxBytes: 100 });
    expect(await adapter.check()).toEqual({
      status: "ok",
      metadata: { metric: "rss", usedBytes: 100, maxBytes: 100 },
    });
    rss.mockReturnValue(101);
    expect((await adapter.check()).status).toBe("fail");
    vi.mocked(memoryUsage).mockReturnValue({
      rss: 100,
      heapUsed: 50,
      heapTotal: 80,
      external: 10,
      arrayBuffers: 5,
    });
    expect((await memoryAdapter({ metric: "heapUsed", maxBytes: 50 }).check()).status).toBe("ok");
  });
  it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid byte threshold %s",
    (maxBytes) => {
      expect(() => memoryAdapter({ maxBytes })).toThrow();
    },
  );
});

describe("disk", () => {
  const stats = {
    bsize: 4096n,
    frsize: 4096n,
    blocks: 100n,
    bavail: 10n,
    bfree: 20n,
    type: 0n,
    files: 0n,
    ffree: 0n,
  };
  it("uses unprivileged available blocks, combines bounds, omits paths", async () => {
    vi.mocked(statfs).mockResolvedValue(stats);
    const adapter = diskAdapter({
      path: "/private/data",
      minAvailableBytes: 40960,
      minAvailablePercent: 10,
    });
    expect(await adapter.check()).toEqual({
      status: "ok",
      metadata: {
        availableBytes: "40960",
        totalBytes: "409600",
        availablePercent: 10,
        minAvailableBytes: 40960,
        minAvailablePercent: 10,
      },
    });
    expect(statfs).toHaveBeenCalledWith("/private/data", { bigint: true });
    vi.mocked(statfs).mockResolvedValue({ ...stats, bavail: 9n });
    expect((await adapter.check()).status).toBe("fail");
  });
  it("preserves large byte counts and fails unknown capacity", async () => {
    vi.mocked(statfs).mockResolvedValue({ ...stats, bsize: 2n ** 54n });
    expect(
      (await diskAdapter({ path: ".", minAvailableBytes: 1 }).check()).metadata?.availableBytes,
    ).toBe((10n * 2n ** 54n).toString());
    vi.mocked(statfs).mockResolvedValue({ ...stats, blocks: 0n });
    expect((await diskAdapter({ path: ".", minAvailableBytes: 1 }).check()).status).toBe("fail");
  });
  it("sanitizes filesystem errors and honors cancellation", async () => {
    vi.mocked(statfs).mockRejectedValue(new Error("secret-path"));
    const adapter = diskAdapter({ path: "/secret-path", minAvailableBytes: 1 });
    expect(String((await adapter.check()).error)).not.toContain("secret-path");
    vi.mocked(statfs).mockClear();
    expect((await adapter.check({ signal: AbortSignal.abort() })).status).toBe("fail");
    expect(statfs).not.toHaveBeenCalled();
  });
  it("validates configuration eagerly", () => {
    for (const options of [
      { path: "", minAvailableBytes: 1 },
      { path: "." },
      { path: ".", minAvailableBytes: -1 },
      { path: ".", minAvailablePercent: 101 },
      { path: ".", minAvailablePercent: NaN },
    ]) {
      expect(() => diskAdapter(options)).toThrow();
    }
  });
});

describe("event loop", () => {
  it("warms up, converts ns to ms, caches fixed windows, and disposes once", async () => {
    vi.useFakeTimers();
    const histogram = { count: 5, max: 20e6, enable: vi.fn(), disable: vi.fn(), reset: vi.fn() };
    vi.mocked(monitorEventLoopDelay).mockReturnValue(
      histogram as unknown as ReturnType<typeof monitorEventLoopDelay>,
    );
    const adapter = eventLoopAdapter({ maxDelayMs: 20, windowMs: 100, resolutionMs: 10 });
    expect((await adapter.check()).metadata?.warmingUp).toBe(true);
    expect((await adapter.check()).status).toBe("fail");
    await vi.advanceTimersByTimeAsync(100);
    const result = await adapter.check();
    expect(result.status).toBe("ok");
    expect(result.metadata).toMatchObject({
      delayMs: 20,
      observedWindowMs: 100,
      sampleCount: 5,
      warmingUp: false,
    });
    if (result.metadata) result.metadata.delayMs = -1;
    expect((await adapter.check()).metadata?.delayMs).toBe(20);
    expect(histogram.reset).toHaveBeenCalledTimes(1);
    histogram.max = 21e6;
    await vi.advanceTimersByTimeAsync(100);
    expect((await adapter.check()).status).toBe("fail");
    histogram.count = 0;
    await vi.advanceTimersByTimeAsync(100);
    expect((await adapter.check()).metadata).not.toHaveProperty("delayMs");
    await adapter.dispose?.();
    await adapter.dispose?.();
    expect(histogram.disable).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect((await adapter.check()).status).toBe("fail");
  });
  it("rejects invalid timer and threshold settings before creating a monitor", () => {
    for (const options of [
      { maxDelayMs: 0 },
      { maxDelayMs: Infinity },
      { maxDelayMs: 10, resolutionMs: 0 },
      { maxDelayMs: 10, windowMs: 10 },
      { maxDelayMs: 10, windowMs: 2 ** 32 },
    ]) {
      expect(() => eventLoopAdapter(options)).toThrow();
    }
    expect(monitorEventLoopDelay).not.toHaveBeenCalled();
  });
});
