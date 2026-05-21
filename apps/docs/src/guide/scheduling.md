---
title: Scheduling
description: Run expensive health checks on an interval and serve probes from cached results.
---

# Scheduling

For expensive checks (database, external APIs), you can run them on a timer and serve probes from cache.

```ts
const kit = createHealthKit({
  checks: [
    {
      name: "db",
      type: ["readiness"],
      adapter: { check: async () => ({ status: "ok" }) },
      schedule: { intervalMs: 30_000 },
    },
  ],
});

kit.start(); // starts background intervals for checks that define schedule
// ... on shutdown:
kit.stop();
```

## Behavior

- **`start()`** is idempotent; a second call does nothing.
- **`stop()`** clears intervals and the cache.
- When a cached result is used, that check’s **`latency`** is **0** and **`cachedAt`** is an ISO timestamp on the check result.

Scheduled runs call **`adapter.check()`** directly (there is no per-request timeout wrapper in the scheduler). Timeouts still apply when there is **no** cache entry and the probe runs the check on demand.

Timers use `unref` when available so they do not keep the process alive by themselves.
