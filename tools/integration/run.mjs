import { spawnSync } from "node:child_process";

const supported = ["postgres", "redis", "rabbitmq", "kafka", "mysql", "mongo"];
const selected = process.argv.slice(2);
const packages = selected.length ? selected : supported;
if (packages.some((name) => !supported.includes(name))) {
  throw new Error(`Choose integration packages from: ${supported.join(", ")}`);
}
const result = spawnSync(
  "vp",
  [
    "run",
    "--no-cache",
    ...packages.flatMap((name) => ["--filter", `@healthzkit/${name}`]),
    "test",
    "--run",
    "tests/integration.test.ts",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, HEALTHZKIT_INTEGRATION: "1" },
    shell: process.platform === "win32",
    timeout: 180_000,
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
