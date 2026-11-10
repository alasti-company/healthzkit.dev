# @healthzkit/bullmq

Check access to an application-owned [BullMQ](https://docs.bullmq.io/) 5 Queue with one `getJobCounts("waiting", "paused", "prioritized", "delayed")` call. The adapter never enqueues or consumes probe jobs, fetches job payloads, or closes your Queue.

```bash
npm install healthzkit @healthzkit/bullmq bullmq@^5
```

```ts
import { Queue } from "bullmq";
import { createHealthKit, toFetchResponse } from "healthzkit";
import { bullmqAdapter } from "@healthzkit/bullmq/bullmq";

// Your application's Queue, also used by its producers.
const queue = new Queue("emails", {
  connection: {
    host: "127.0.0.1",
    port: 6379,
    connectTimeout: 1_000,
    commandTimeout: 1_000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    enableOfflineQueue: false,
  },
});
queue.on("error", (error) => console.error("Queue connection error", error));

const kit = createHealthKit({
  checks: [
    {
      name: "email-queue",
      type: ["readiness"],
      adapter: bullmqAdapter({
        queue,
        thresholds: { waiting: 1_000, paused: 0 },
      }),
      timeout: 2_000,
      schedule: { intervalMs: 30_000 },
      onDegraded: { httpStatus: 503 },
    },
  ],
  output: { exposeError: false, exposeMetadata: false },
});
kit.start();

// Wire this into your framework's readiness route.
export async function readiness() {
  return toFetchResponse(await kit.handleReadiness());
}

// Invoke after your server stops accepting traffic and producers have drained.
export async function shutdown() {
  const deadline = setTimeout(() => process.exit(1), 5_000);
  deadline.unref();
  kit.beginDrain();
  try {
    await kit.close();
    await queue.close(); // Application-owned resources close after health checks.
  } finally {
    clearTimeout(deadline);
  }
}
```

## API and threshold semantics

`bullmqAdapter({ queue, thresholds? })` is exported from both `@healthzkit/bullmq` and `@healthzkit/bullmq/bullmq`. Pass an existing Queue; the adapter creates no connections and supplies no disposal hook. BullMQ is an optional peer dependency; install BullMQ 5 (`>=5.0.0 <6`) when you use this adapter. BullMQ 6 and Bull are outside this package's supported range.

`thresholds` accepts optional `waiting`, `paused`, `prioritized`, and `delayed` limits. Each limit must be a non-negative safe integer. Invalid limits and unknown states throw at factory creation. Configuration is copied when you create the adapter.

- With no thresholds, a successful count query returns `ok` regardless of backlog size.
- A count **strictly greater** than its configured limit returns `degraded`. Equality is `ok`; zero permits an empty state only. Any exceeded limit is sufficient.
- Limits apply separately to each state, with no sum. `waiting` excludes paused jobs; configure `paused` separately. Prioritized and delayed jobs also have separate limits. Delayed jobs include intentionally scheduled future work, so set that limit only when it fits your application.
- Active, failed, completed, and waiting-for-children jobs are not evaluated. Counts do not measure job age, processing latency, or throughput.
- Driver errors, a closed Queue, and malformed count responses return `fail`.

Successful results include `metadata.counts` for those four states, `metadata.exceeded` with exceeded state names, and `metadata.latencyMs`. Filter metadata and errors before exposing a public endpoint. Core degraded responses default to HTTP 200; the example explicitly maps them to 503 for readiness.

## What this check proves

`ok` means the Queue could read its Redis queue counts. An empty or nonexistent queue can return zero counts successfully. This does not prove workers exist, workers are healthy, jobs can finish, or a producer can write jobs. Monitor worker failures and processing progress separately. Use this network dependency in readiness, and keep process liveness independent.

The query reads a fixed number of Redis list/sorted-set cardinalities, without scanning the backlog. This bounds the amount of work and response size, not network duration. Configure finite ioredis `connectTimeout`, `commandTimeout`, `maxRetriesPerRequest`, and reconnect behavior on your supplied Queue. The example disables offline queuing and reconnect retries to fail promptly; choose recovery behavior for your application's producers. Worker connections have different retry requirements: do not reuse these producer settings for Workers that require `maxRetriesPerRequest: null`.

The healthzkit deadline and AbortSignal do not cancel an in-flight BullMQ Redis command. The adapter checks cancellation before and after its count query. Finite driver settings are necessary so pending commands and `kit.close()` can settle; keep an application shutdown deadline as shown.

See [Scheduling](https://healthzkit.dev/guide/scheduling), BullMQ's [getters](https://docs.bullmq.io/guide/jobs/getters), and [connection guidance](https://docs.bullmq.io/guide/connections).
