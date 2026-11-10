# @healthzkit/node

Optional Node.js-only memory, event-loop delay, and disk-capacity checks for healthzkit. Requires Node.js 22.12+ and ESM. Uses built-in APIs; no driver peers or native dependencies.

```sh
npm install healthzkit @healthzkit/node
```

```ts
import { createHealthKit } from "healthzkit";
import { memoryAdapter, eventLoopAdapter, diskAdapter } from "@healthzkit/node";

const kit = createHealthKit({
  output: { exposeError: false, exposeMetadata: false },
  checks: [
    {
      name: "memory",
      type: ["readiness"],
      adapter: memoryAdapter({ metric: "rss", maxBytes: 512 * 1024 * 1024 }),
    },
    {
      name: "event-loop",
      type: ["readiness"],
      adapter: eventLoopAdapter({ maxDelayMs: 100, resolutionMs: 10, windowMs: 1000 }),
    },
    {
      name: "disk",
      type: ["readiness"],
      adapter: diskAdapter({
        path: ".",
        minAvailableBytes: 1024 * 1024 * 1024,
        minAvailablePercent: 10,
      }),
      schedule: { intervalMs: 10_000 },
    },
  ],
});

// Wire await kit.handleReadiness() into your HTTP handler.
kit.start();
// After draining application traffic, during shutdown:
await kit.close();
```

These budgets are illustrative. Measure representative load and choose headroom for your workload. A `fail` returns readiness HTTP 503 by default; recovery follows the next passing observation. There is no hysteresis. Tight thresholds can flap, and removing overloaded replicas can increase load on the others. Consider alerts or `onFail.treatAs: "degraded"` for advisory checks (degraded defaults to HTTP 200). Keep resource and dependency failures out of liveness unless restarting is proven to fix the cause; otherwise you can create restart loops. A blocked event loop cannot serve health requests promptly, even with a background monitor.

## Memory

`memoryAdapter({ maxBytes, metric? })`, also exported from `@healthzkit/node/memory`.

- `maxBytes` is required, a finite positive safe integer; equality passes.
- `metric` defaults to `rss`: whole-process resident bytes, including native allocations. In worker threads RSS covers the whole process.
- `heapUsed` measures the current isolate's V8 heap, not all process memory. Garbage collection makes it fluctuate. Neither metric is a container limit or total container consumption. No host-memory denominator or cgroup limit is inferred.
- Metadata: `metric`, `usedBytes`, `maxBytes`. Readings are instantaneous; RSS can remain high due to allocator fragmentation.

## Event-loop delay

`eventLoopAdapter({ maxDelayMs, resolutionMs?, windowMs? })`, also exported from `@healthzkit/node/event-loop`.

- `maxDelayMs` is required, finite and positive. Equality passes. Delay is the maximum **sampled timer delay** in the last completed window, converted from Node's nanoseconds to milliseconds. It includes the sampling resolution baseline: `maxDelayMs` must be greater than `resolutionMs`.
- `resolutionMs` defaults to 10; `windowMs` defaults to 1000. Both must be positive integers no greater than 2,147,483,647; the window must be at least twice the resolution.
- Monitoring starts at factory construction. Before the first completed window, checks immediately return `fail` with `warmingUp: true`; there is no per-check sleep. Empty windows also fail, without a `delayMs` value.
- An unreferenced interval snapshots and resets the histogram in fixed windows. Repeated checks return copies of the latest completed window. A window callback can run late under load; `observedWindowMs` reports its actual elapsed duration. Sampling is approximate, not a bound on every request or a guarantee to detect every stall. A bad window remains visible until the next window completes. This measures the calling thread's event loop.
- Metadata: `warmingUp`, `sampleCount`, `delayMs` (when sampled), `maxDelayMs`, `resolutionMs`, `windowMs`, `observedWindowMs` (after warm-up).
- Call `await kit.close()` or `await adapter.dispose()` to disable the owned histogram and clear its timer. Disposal is terminal and idempotent. Create a separate adapter for each kit that closes independently; closing one kit disposes a shared adapter for every kit using it. Neither monitor nor interval keeps the process alive. `kit.stop()` only stops core scheduling; it does not dispose the monitor.

## Disk capacity

`diskAdapter({ path, minAvailableBytes?, minAvailablePercent? })`, also exported from `@healthzkit/node/disk`.

- `path` must name an existing file or directory on the target filesystem. Relative paths resolve against the working directory at check time. At least one threshold is required; both must pass if provided.
- `minAvailableBytes`: positive safe integer, inclusive lower bound. `minAvailablePercent`: finite number greater than 0 through 100, inclusive lower bound.
- Uses `fs.promises.statfs` with BigInt: available bytes = `bavail * bsize` (blocks available to unprivileged users); total bytes = `blocks * bsize`; available percent = `bavail / blocks * 100`. Metadata byte counts are exact **decimal strings**, percentages are floating point.
- Metadata: `availableBytes`, `totalBytes`, `availablePercent`, and configured thresholds. Paths and raw filesystem errors are omitted. Unknown/zero total capacity, invalid statistics, inaccessible paths, and unsupported filesystem/platform operations fail safely.
- This measures filesystem capacity as reported by the OS. It does not prove writability, measure inode exhaustion, guarantee quotas, or reserve space. Containers, overlays, network filesystems and quotas can report capacity different from an application's effective allowance. Check the actual mounted data volume and verify behavior on your deployment platform.
- `statfs` is not cancellable; a core timeout does not stop pending filesystem I/O. No files are opened or written and no resources need disposal.

See [Scheduling](https://healthzkit.dev/guide/scheduling) to cache filesystem reads. Public metadata can reveal resource budgets, so use output filtering.

Node API references: [process memory](https://nodejs.org/api/process.html#processmemoryusage), [event-loop monitoring](https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions), [filesystem statistics](https://nodejs.org/api/fs.html#fspromisesstatfspath-options).
