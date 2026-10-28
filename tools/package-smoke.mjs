import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
import { pgAdapter } from '@healthzkit/postgres/pg';
import { httpAdapter } from '@healthzkit/http/http';
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
  run(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], temporary);
  assert.ok(entrypoints.length > 0);
  console.log(
    `Packed consumer smoke passed: ${directories.length} packages, ${entrypoints.length} entrypoints (runtime + strict TypeScript).`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
