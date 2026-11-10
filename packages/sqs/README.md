# @healthzkit/sqs

Check a configured Amazon SQS queue with AWS SDK v3 `GetQueueAttributes`. The adapter never sends, receives, deletes, or changes messages. Management API access does not prove send/receive capability, consumer progress, or KMS permissions for message payloads.

## Install and use

```bash
npm install healthzkit @healthzkit/sqs @aws-sdk/client-sqs
```

`@aws-sdk/client-sqs` >= 3 is an optional peer; install it when using this adapter. Node.js >= 22.12 and ESM are required.

```ts
import { createHealthKit } from "healthzkit";
import { sqsV3Adapter } from "@healthzkit/sqs/v3";

const kit = createHealthKit({
  output: { exposeError: false, exposeMetadata: false },
  defaults: { timeout: 2_000 },
  checks: [
    {
      name: "jobs",
      type: ["readiness"],
      schedule: { intervalMs: 5_000 },
      adapter: sqsV3Adapter({
        queueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/jobs",
        config: {
          region: "us-east-1",
          maxAttempts: 1,
          requestHandler: { connectionTimeout: 500, requestTimeout: 1_500 },
        },
        // Optional: choose a limit appropriate for your workload.
        backlogThresholds: { visible: 1_000 },
      }),
    },
  ],
});
kit.start();
const readiness = await kit.handleReadiness();
console.log(readiness.status);
// After draining application traffic, within your application's shutdown deadline:
await kit.close();
```

Keep external services in readiness checks. Use [scheduling](https://healthzkit.dev/guide/scheduling) to limit API traffic and cost. Bound shutdown at the application level with a deadline shorter than your termination grace period: a transport or metadata hook that ignores cancellation can keep `kit.close()` pending.

## Exports and options

Both `@healthzkit/sqs` and `@healthzkit/sqs/v3` export `sqsV3Adapter`, `SQSV3AdapterOptions`, and `SQSBacklogThresholds`.

| Option              | Description                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `queueUrl`          | Required full URL of the queue. No queue discovery or creation occurs.                                     |
| `client`            | Existing `SQSClient`, owned by your application. Mutually exclusive with `config`.                         |
| `config`            | `SQSClientConfig` for a lazily created, reused client. Defaults to SDK configuration resolution.           |
| `backlogThresholds` | Optional `{ visible?, notVisible?, delayed? }` limits, each a nonnegative safe integer. No default limits. |
| `metadata`          | Optional sync/async `(client) => Record<string, unknown>` hook. Built-in metadata fields take precedence.  |

To reuse a client:

```ts
import { SQSClient } from "@aws-sdk/client-sqs";
import { sqsV3Adapter } from "@healthzkit/sqs";

const client = new SQSClient({ region: "us-east-1", maxAttempts: 1 });
const adapter = sqsV3Adapter({
  client,
  queueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/jobs",
});
await adapter.check();
await adapter.dispose?.();
client.destroy(); // Only when all application users have stopped.
```

## Results and backlog thresholds

Each check requests only `ApproximateNumberOfMessages`, `ApproximateNumberOfMessagesNotVisible`, and `ApproximateNumberOfMessagesDelayed`. Success returns `ok` with `metadata.latencyMs` and numeric `metadata.approximateBacklog: { visible, notVisible, delayed }`.

A count strictly greater than its configured threshold returns `degraded`; equality remains `ok`. `visible` counts messages available for retrieval, `notVisible` counts in-flight messages, and `delayed` counts messages awaiting their delay. Limits are independent; counts are not summed. Zero is a valid limit. Invalid limits throw when creating the adapter. Missing or invalid response counts return `fail` rather than silently assuming zero. SDK or metadata hook errors return `fail` with the caught error.

Counts are approximate and eventually consistent. [AWS documents](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_GetQueueAttributes.html) that they may take at least one minute to become consistent after producers stop. A backlog can be normal; opt into thresholds only when they indicate a readiness problem for your workload.

## Minimum IAM permissions

Grant `sqs:GetQueueAttributes` on the specific queue ARN, for example:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sqs:GetQueueAttributes",
      "Resource": "arn:aws:sqs:us-east-1:123456789012:jobs"
    }
  ]
}
```

No `sqs:ListQueues`, `sqs:GetQueueUrl`, `sqs:SendMessage`, or `sqs:ReceiveMessage` permission is needed. Queue policies, cross-account policies, endpoint policies, and explicit denies still apply. See the [AWS permissions reference](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-api-permissions-reference.html). A successful attribute request proves only access to this management operation on this queue, not your application's ability to send or consume messages.

## Cancellation and ownership

The adapter forwards `CheckContext.signal` as `send(command, { abortSignal })`, checks for cancellation before and after SDK work and metadata, and preserves the cancellation reason. Cancellation never destroys the client. Calling `check()` without context works. Cancellation is cooperative; configure finite SDK retries and transport timeouts. Metadata hooks receive only the client and need their own bounds for additional work.

Disposal waits for active checks and destroys only the lazily created client, once. An unused adapter creates no client during disposal. Supplied clients remain application-owned. Passing `config.requestHandler`, including custom agents, transfers its shutdown lifecycle to the owned SDK client; pass a preconstructed client to retain ownership of shared handlers/agents. After disposal, checks return `fail`.
