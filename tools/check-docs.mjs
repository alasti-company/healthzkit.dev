import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const docs = join(root, "apps/docs");
const recipe = await readFile(join(docs, "guide/integrate-healthzkit.mdx"), "utf8");
const examples = [...recipe.matchAll(/^```ts health\.ts\n([\s\S]*?)^```/gm)];
assert.equal(examples.length, 1, "Expected one canonical health.ts example");

// Check the recipe's local page links and all navigation pages without fetching a site.
for (const [, path] of recipe.matchAll(/\]\(\/([^\s)#]+)(?:#[^)]*)?\)/g)) {
  await access(join(docs, `${path}.mdx`));
}
const config = JSON.parse(await readFile(join(docs, "docs.json"), "utf8"));
async function checkPages(groups) {
  for (const group of groups) {
    if (typeof group === "string") await access(join(docs, `${group}.mdx`));
    else await checkPages(group.pages ?? []);
  }
}
await checkPages(config.navigation.groups);

// Keep module resolution in the existing Node consumer, using its locked dependencies.
const temporary = await mkdtemp(join(root, "apps/example-node/.docs-check-"));
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: "inherit" });
try {
  await writeFile(
    join(temporary, "health.ts"),
    examples[0][1] +
      `
import assert from "node:assert/strict";

async function verify(fail: boolean) {
  let queries = 0;
  let releases = 0;
  let closes = 0;
  const pool = {
    totalCount: 0, idleCount: 0, waitingCount: 0,
    connect: async () => ({
      query: async () => {
        queries++;
        if (fail) throw new Error("password=secret internal-host");
        return { rows: [] };
      },
      release: () => { releases++; },
    }),
    end: async () => { closes++; },
  };
  const { app, kit } = createProbes(pool as unknown as Pool);
  try {
    const ready = await app.request("/healthz/ready");
    assert.equal(ready.status, fail ? 503 : 200);
    const body = await ready.text();
    assert.doesNotMatch(body, /secret|internal-host|metadata|error/);
    assert.equal(queries, 1, "Readiness must query the supplied pool");
    assert.equal(releases, 1, "Borrowed connections must be released");
    assert.equal((await app.request("/healthz/live")).status, 200);
    assert.equal((await app.request("/healthz/startup")).status, 200);
    const head = await app.request("/healthz/ready", { method: "HEAD" });
    assert.equal(head.status, fail ? 503 : 200);
    assert.equal(await head.text(), "");
    const post = await app.request("/healthz/ready", { method: "POST" });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get("allow"), "GET, HEAD");
    kit.start();
    kit.beginDrain();
    assert.equal((await app.request("/healthz/ready")).status, 503);
    assert.equal((await app.request("/healthz/live")).status, 200);
  } finally {
    await kit.close();
  }
  assert.equal(closes, 0, "The shared pool remains application-owned");
  await pool.end();
  assert.equal(closes, 1);
}
await verify(false);
await verify(true);
console.log("Integration recipe: types, probes, failures, redaction, and ownership passed");
`,
  );
  await writeFile(
    join(temporary, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2023",
        module: "NodeNext",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: ["node"],
      },
      files: ["health.ts"],
    }),
  );
  run(process.execPath, [
    join(root, "packages/healthzkit/node_modules/typescript/bin/tsc"),
    "--project",
    join(temporary, "tsconfig.json"),
  ]);
  run("vpx", [join(temporary, "health.ts")]);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
