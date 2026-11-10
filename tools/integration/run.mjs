import { spawn, spawnSync } from "node:child_process";

const supported = ["postgres", "redis", "bullmq", "rabbitmq", "kafka", "mysql", "mongo"];
const selected = process.argv.slice(2);
const packages = selected.length ? selected : supported;
if (packages.some((name) => !supported.includes(name))) {
  throw new Error(`Choose integration packages from: ${supported.join(", ")}`);
}
const child = spawn(
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
    detached: process.platform !== "win32",
  },
);
let timedOut = false;
function terminateTree() {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
}
const deadline = setTimeout(() => {
  timedOut = true;
  console.error("Integration tests timed out after 180000ms; terminating the process tree.");
  terminateTree();
}, 180_000);
const signals = ["SIGINT", "SIGTERM"];
const handlers = new Map(
  signals.map((signal) => [
    signal,
    () => {
      timedOut = true;
      terminateTree();
    },
  ]),
);
for (const [signal, handler] of handlers) process.once(signal, handler);
function cleanup() {
  clearTimeout(deadline);
  for (const [signal, handler] of handlers) process.removeListener(signal, handler);
}
child.once("error", (error) => {
  cleanup();
  console.error(error.message);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  cleanup();
  process.exitCode = timedOut ? 1 : (code ?? 1);
});
