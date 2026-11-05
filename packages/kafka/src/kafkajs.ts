import { withDisposal } from "@healthzkit/shared";
import type { Kafka, Admin } from "kafkajs";
import type { BaseKafkaOptions, MetadataFn } from "./shared.ts";
import type { HealthAdapter, AdapterResult } from "./shared.ts";
import { buildResult, buildErrorResult } from "./shared.ts";

export interface KafkaJsAdapterOptionsWithClient extends BaseKafkaOptions<Kafka> {
  client: Kafka;
  config?: never;
}

export interface KafkaJsAdapterOptionsWithConfig extends BaseKafkaOptions<Kafka> {
  config: ConstructorParameters<typeof Kafka>[0];
  client?: never;
}

export type KafkaJsAdapterOptions =
  | KafkaJsAdapterOptionsWithClient
  | KafkaJsAdapterOptionsWithConfig;

export function kafkajsAdapter(options: KafkaJsAdapterOptions): HealthAdapter {
  let internalClient: Kafka | null = null;
  const admins = new Set<Admin>();
  let queue: Promise<unknown> = Promise.resolve();

  async function getClient(): Promise<Kafka> {
    if ("client" in options && options.client) {
      return options.client;
    }

    if (!internalClient) {
      const { Kafka } = await import("kafkajs");
      internalClient = new Kafka(options.config);
    }

    return internalClient;
  }

  return withDisposal(
    {
      check(): Promise<AdapterResult> {
        const operation = queue.then(runCheck);
        queue = operation.catch(() => {});
        return operation;
      },
    },
    cleanupAdmins,
  );

  async function cleanupAdmins(): Promise<void> {
    const results = await Promise.allSettled(
      [...admins].map(async (admin) => {
        await admin.disconnect();
        admins.delete(admin);
      }),
    );
    const errors = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (errors.length) throw new AggregateError(errors, "KafkaJS admin cleanup failed");
  }

  async function runCheck(): Promise<AdapterResult> {
    let admin: Admin | null = null;

    try {
      // Do not allocate another admin until every previous one is released.
      await cleanupAdmins();
      const client = await getClient();
      const start = Date.now();

      admin = client.admin();
      admins.add(admin);
      await admin.connect();
      await admin.describeCluster();
      const latencyMs = Date.now() - start;

      const metadataResult = options.metadata
        ? (options.metadata as MetadataFn<Kafka>)(client)
        : undefined;
      const metadata = metadataResult instanceof Promise ? await metadataResult : metadataResult;

      return buildResult(latencyMs, metadata);
    } catch (error) {
      return buildErrorResult(error);
    } finally {
      if (admin) {
        const current = admin;
        await current.disconnect().then(
          () => {
            admins.delete(current);
          },
          () => {},
        );
      }
    }
  }
}
