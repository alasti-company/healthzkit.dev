import { withDisposal } from "@healthzkit/shared";
import type {
  SQSClient,
  SQSClientConfig,
  GetQueueAttributesCommandOutput,
} from "@aws-sdk/client-sqs";
import type { MetadataFn } from "@healthzkit/shared";
import type { HealthAdapter, AdapterResult } from "@healthzkit/shared";
import { buildResult, buildErrorResult } from "@healthzkit/shared";

export interface SQSBacklogThresholds {
  /** Degrade when ApproximateNumberOfMessages exceeds this limit. */
  visible?: number;
  /** Degrade when ApproximateNumberOfMessagesNotVisible exceeds this limit. */
  notVisible?: number;
  /** Degrade when ApproximateNumberOfMessagesDelayed exceeds this limit. */
  delayed?: number;
}

interface BaseSQSOptions<TClient> {
  queueUrl: string;
  /** Optional nonnegative safe integer limits. Equality is healthy. */
  backlogThresholds?: SQSBacklogThresholds;
  metadata?: MetadataFn<TClient>;
}

const countAttributes = {
  visible: "ApproximateNumberOfMessages",
  notVisible: "ApproximateNumberOfMessagesNotVisible",
  delayed: "ApproximateNumberOfMessagesDelayed",
} as const;

export interface SQSV3AdapterOptionsWithClient extends BaseSQSOptions<SQSClient> {
  client: SQSClient;
  config?: never;
}

export interface SQSV3AdapterOptionsWithConfig extends BaseSQSOptions<SQSClient> {
  /** Disposal destroys the configured handler and its agents. Pass a client to retain ownership. */
  config?: SQSClientConfig;
  client?: never;
}

export type SQSV3AdapterOptions = SQSV3AdapterOptionsWithClient | SQSV3AdapterOptionsWithConfig;

export function sqsV3Adapter(options: SQSV3AdapterOptions): HealthAdapter {
  if (!options.queueUrl.trim()) throw new TypeError("queueUrl must not be empty");
  for (const limit of Object.values(options.backlogThresholds ?? {})) {
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0)) {
      throw new RangeError("Backlog thresholds must be nonnegative safe integers");
    }
  }
  let internalClient: SQSClient | null = null;

  let ownedInit: ReturnType<typeof resolveClient> | undefined;
  function getClient(): ReturnType<typeof resolveClient> {
    if (options.client) return resolveClient();
    ownedInit ??= resolveClient().catch((error: unknown) => {
      ownedInit = undefined;
      throw error;
    });
    return ownedInit;
  }

  async function resolveClient(): Promise<SQSClient> {
    if ("client" in options && options.client) {
      return options.client;
    }

    if (!internalClient) {
      const { SQSClient } = await import("@aws-sdk/client-sqs");
      internalClient = new SQSClient(options.config ?? {});
    }

    return internalClient;
  }

  return withDisposal(
    {
      async check(context): Promise<AdapterResult> {
        try {
          context?.signal.throwIfAborted();
          const client = await getClient();
          const start = Date.now();

          const { GetQueueAttributesCommand } = await import("@aws-sdk/client-sqs");
          context?.signal.throwIfAborted();
          const response: GetQueueAttributesCommandOutput = await client.send(
            new GetQueueAttributesCommand({
              QueueUrl: options.queueUrl,
              AttributeNames: Object.values(countAttributes),
            }),
            {
              abortSignal: context?.signal,
            },
          );
          context?.signal.throwIfAborted();
          const latencyMs = Date.now() - start;

          const metadataResult = options.metadata
            ? (options.metadata as MetadataFn<SQSClient>)(client)
            : undefined;
          const metadata =
            metadataResult instanceof Promise ? await metadataResult : metadataResult;
          context?.signal.throwIfAborted();
          const approximateBacklog: Record<string, number> = {};
          let degraded = false;
          for (const key of Object.keys(countAttributes) as (keyof SQSBacklogThresholds)[]) {
            const value = response.Attributes?.[countAttributes[key]];
            const count = value !== undefined && /^\d+$/.test(value) ? Number(value) : NaN;
            if (!Number.isSafeInteger(count)) {
              throw new Error(`Missing or invalid SQS attribute: ${countAttributes[key]}`);
            }
            approximateBacklog[key] = count;
            const limit = options.backlogThresholds?.[key];
            if (limit !== undefined && count > limit) degraded = true;
          }
          return {
            ...buildResult(latencyMs, { ...metadata, approximateBacklog }),
            status: degraded ? "degraded" : "ok",
          };
        } catch (error) {
          return buildErrorResult(context?.signal.aborted ? context.signal.reason : error);
        }
      },
    },
    async () => {
      internalClient?.destroy();
    },
  );
}
