import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Deliberately outside the workspace: no source aliases or workspace symlinks.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(join(tmpdir(), "healthzkit-consumer-"));
const manifest = async (path) => JSON.parse(await readFile(path, "utf8"));
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: "inherit" });

try {
  const directories = [
    join(root, "tools/shared"),
    ...(await readdir(join(root, "packages"))).map((name) => join(root, "packages", name)),
  ];
  const dependencies = {};
  const entrypoints = [];
  for (const directory of directories) {
    const pkg = await manifest(join(directory, "package.json"));
    run("vp", ["pm", "pack", "--", "--pack-destination", temporary, "--ignore-scripts"], directory);
    const filename = `${pkg.name.replace(/^@/, "").replaceAll("/", "-")}-${pkg.version}.tgz`;
    dependencies[pkg.name] = `file:${join(temporary, filename)}`;
    for (const subpath of Object.keys(pkg.exports)) {
      if (subpath !== "./package.json") {
        entrypoints.push(pkg.name + (subpath === "." ? "" : subpath.slice(1)));
      }
    }
    // Use the exact drivers/types installed by the workspace lockfile, not latest peers.
    const peersAndTypes = new Set([
      ...Object.keys(pkg.peerDependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}).filter((name) => name.startsWith("@types/")),
    ]);
    for (const name of peersAndTypes) {
      const installed = await manifest(join(directory, "node_modules", name, "package.json"));
      dependencies[name] = installed.version;
    }
  }
  const typescript = await manifest(
    join(root, "packages/healthzkit/node_modules/typescript/package.json"),
  );
  dependencies.typescript = typescript.version;
  await writeFile(
    join(temporary, "package.json"),
    JSON.stringify({ private: true, type: "module", dependencies }, null, 2),
  );
  // Native drivers are only imported lazily by adapters. No database/native build is
  // required to verify their entrypoints and declarations; never execute install scripts.
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], temporary);
  await writeFile(
    join(temporary, "runtime.mjs"),
    `import assert from 'node:assert/strict';
for (const specifier of ${JSON.stringify(entrypoints)}) {
  const exports = await import(specifier);
  assert.ok(Object.keys(exports).length > 0, specifier + ' has no runtime exports');
}
const { createHealthKit, toFetchResponse } = await import('healthzkit');
const { httpAdapter } = await import('@healthzkit/http/http');
const { memoryAdapter, diskAdapter, eventLoopAdapter } = await import('@healthzkit/node');
assert.equal((await memoryAdapter({ maxBytes: Number.MAX_SAFE_INTEGER }).check()).status, 'ok');
const disk = await diskAdapter({ path: '.', minAvailableBytes: 1 }).check();
assert.equal(typeof disk.metadata?.availableBytes, 'string');
assert.equal(disk.status, BigInt(disk.metadata.availableBytes) >= 1n ? 'ok' : 'fail');
const loop = eventLoopAdapter({ maxDelayMs: 1000, windowMs: 100, resolutionMs: 10 });
assert.equal((await loop.check()).metadata.warmingUp, true);
const resourcesKit = createHealthKit({ checks: [{ name: 'event-loop', type: ['readiness'], adapter: loop }] });
assert.equal((await resourcesKit.handleReadiness()).status, 503);
await new Promise(resolve => setTimeout(resolve, 150));
assert.equal((await loop.check()).metadata.warmingUp, false);
assert.ok((await loop.check()).metadata.sampleCount > 0);
assert.equal((await resourcesKit.handleReadiness()).status, 200);
await resourcesKit.close();
await loop.dispose();
assert.equal((await loop.check()).status, 'fail');
assert.equal(typeof httpAdapter, 'function');
const kit = createHealthKit({ checks: [{ name: 'process', type: ['readiness'], adapter: { check: async () => ({ status: 'ok' }) } }] });
assert.equal(toFetchResponse(await kit.handleReadiness()).status, 200);
`,
  );
  await writeFile(
    join(temporary, "consumer.mts"),
    entrypoints
      .map(
        (specifier, index) =>
          `import * as entry${index} from ${JSON.stringify(specifier)};\nvoid entry${index};`,
      )
      .join("\n") +
      `\nimport { createHealthKit, type HealthAdapter } from 'healthzkit';
import { memoryAdapter } from '@healthzkit/node/memory';
import { diskAdapter } from '@healthzkit/node/disk';
import { eventLoopAdapter } from '@healthzkit/node/event-loop';
const resources: HealthAdapter[] = [memoryAdapter({ maxBytes: 1024 }), diskAdapter({ path: '.', minAvailablePercent: 10 }), eventLoopAdapter({ maxDelayMs: 100 })];
void resources;
// @ts-expect-error Explicit memory threshold is required.
memoryAdapter({});
// @ts-expect-error Event-loop thresholds use milliseconds as numbers.
eventLoopAdapter({ maxDelayMs: '100' });
import { pgAdapter } from '@healthzkit/postgres/pg';
import { httpAdapter } from '@healthzkit/http/http';
import { sqsV3Adapter } from '@healthzkit/sqs/v3';
import { SQSClient } from '@aws-sdk/client-sqs';
const sqs: HealthAdapter = sqsV3Adapter({ queueUrl: 'https://sqs.us-east-1.amazonaws.com/123/jobs', client: new SQSClient({}), backlogThresholds: { visible: 0 } });
void sqs;
// @ts-expect-error Supply client or config, never both.
sqsV3Adapter({ queueUrl: 'queue', client: new SQSClient({}), config: {} });
// @ts-expect-error Thresholds must be numeric.
sqsV3Adapter({ queueUrl: 'queue', backlogThresholds: { visible: '0' } });
import { nodeRedisAdapter } from '@healthzkit/redis/redis';
import { createClient } from 'redis';
import { azureServiceBusAdapter } from '@healthzkit/azure-service-bus';
import { ServiceBusAdministrationClient } from '@azure/service-bus';
const administrationClient = new ServiceBusAdministrationClient('Endpoint=sb://example.servicebus.windows.net/;SharedAccessKeyName=manage;SharedAccessKey=a2V5');
const serviceBus: HealthAdapter = azureServiceBusAdapter({ client: administrationClient, queueName: 'orders' });
void serviceBus;
azureServiceBusAdapter({ connectionString: 'connection', queueName: 'orders', clientOptions: { retryOptions: { maxRetries: 0 } } });
// @ts-expect-error Client and connection string are exclusive.
azureServiceBusAdapter({ client: administrationClient, connectionString: 'connection', queueName: 'orders' });
// @ts-expect-error Queue names must be strings.
azureServiceBusAdapter({ client: administrationClient, queueName: 123 });
import { Queue } from 'bullmq';
import { bullmqAdapter } from '@healthzkit/bullmq/bullmq';
const typedQueue = new Queue<{ email: string }, void, 'send'>('mail', { connection: {}, skipMetasUpdate: true });
const bullmq: HealthAdapter = bullmqAdapter({ queue: typedQueue, thresholds: { waiting: 10, paused: 0 } });
void bullmq;
// @ts-expect-error Backlog thresholds must be numbers.
bullmqAdapter({ queue: typedQueue, thresholds: { waiting: '10' } });
// @ts-expect-error Queue must expose the count operation.
bullmqAdapter({ queue: {} });
nodeRedisAdapter({ client: createClient() });
const postgres: HealthAdapter = pgAdapter({ connectionString: 'postgres://localhost/smoke' });
const http: HealthAdapter = httpAdapter({ url: 'https://example.com' });
void postgres;
void http;
// @ts-expect-error Adapter options must remain typed, not any.
pgAdapter({ connectionString: 123 });
const adapter: HealthAdapter = { check: async () => ({ status: 'ok' }) };
const response: Promise<{ status: number }> = createHealthKit({ checks: [{ name: 'process', type: ['readiness'], adapter }] }).handleReadiness();
void response;
// @ts-expect-error Status must remain a typed union, not any.
const invalid: HealthAdapter = { check: async () => ({ status: 'not-a-status' }) };
void invalid;
`,
  );
  await writeFile(
    join(temporary, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2022",
        skipLibCheck: true,
      },
      files: ["consumer.mts"],
    }),
  );
  run(process.execPath, ["runtime.mjs"], temporary);
  // A constructed monitor must not keep an otherwise idle process alive.
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import { eventLoopAdapter } from '@healthzkit/node'; eventLoopAdapter({ maxDelayMs: 100 });",
    ],
    { cwd: temporary, timeout: 5000, stdio: "inherit" },
  );
  run(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], temporary);
  // Verify the advertised minimum Redis peer using packed declarations, without
  // skipLibCheck hiding references to types only available in newer drivers.
  const redisLegacy = join(temporary, "redis-legacy");
  await mkdir(redisLegacy);
  await writeFile(
    join(redisLegacy, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: {
        healthzkit: dependencies.healthzkit,
        "@healthzkit/shared": dependencies["@healthzkit/shared"],
        "@healthzkit/redis": dependencies["@healthzkit/redis"],
        redis: "4.0.0",
        "@types/node": dependencies["@types/node"],
        typescript: dependencies.typescript,
      },
    }),
  );
  run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--legacy-peer-deps"],
    redisLegacy,
  );
  await writeFile(
    join(redisLegacy, "consumer.mts"),
    `
import { nodeRedisAdapter } from '@healthzkit/redis/redis';
import { createClient } from 'redis';
nodeRedisAdapter({ client: createClient(), metadata: async (client) => ({ pong: await client.sendCommand(['PING']) }) });
nodeRedisAdapter({ connectionString: 'redis://localhost', redisOptions: { socket: { port: 6379 } } });
// @ts-expect-error A client must provide the required command method.
nodeRedisAdapter({ client: { isOpen: true, connect: async () => {} } });
`,
  );
  await writeFile(
    join(redisLegacy, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2022",
        skipLibCheck: false,
        types: ["node"],
      },
      files: ["consumer.mts"],
    }),
  );
  run(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], redisLegacy);
  // Validate the minimum advertised BullMQ peer with the packed public declarations.
  const bullmqLegacy = join(temporary, "bullmq-legacy");
  await mkdir(bullmqLegacy);
  await writeFile(
    join(bullmqLegacy, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: {
        healthzkit: dependencies.healthzkit,
        "@healthzkit/shared": dependencies["@healthzkit/shared"],
        "@healthzkit/bullmq": dependencies["@healthzkit/bullmq"],
        bullmq: "5.0.0",
        "@types/node": dependencies["@types/node"],
        typescript: dependencies.typescript,
      },
    }),
  );
  run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--legacy-peer-deps"],
    bullmqLegacy,
  );
  await writeFile(
    join(bullmqLegacy, "consumer.mts"),
    `
import type { Queue } from 'bullmq';
import type { HealthAdapter } from 'healthzkit';
import { bullmqAdapter } from '@healthzkit/bullmq/bullmq';
declare const queue: Queue<{ email: string }, void, 'send'>;
const adapter: HealthAdapter = bullmqAdapter({ queue, thresholds: { waiting: 0 } });
void adapter;
// @ts-expect-error Unsupported states must not silently pass type checking.
bullmqAdapter({ queue, thresholds: { completed: 10 } });
`,
  );
  await writeFile(
    join(bullmqLegacy, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2022",
        skipLibCheck: false,
        types: ["node"],
      },
      files: ["consumer.mts"],
    }),
  );
  run(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], bullmqLegacy);
  assert.ok(entrypoints.length > 0);
  console.log(
    `Packed consumer smoke passed: ${directories.length} packages, ${entrypoints.length} entrypoints (runtime + strict TypeScript), plus minimum Redis 4 and BullMQ 5 peer declarations.`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
