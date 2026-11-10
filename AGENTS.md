<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Running Scripts

Run TypeScript and JavaScript files with `vpx <file>`, for example `vpx ./scripts/seed.ts --dry-run`. It handles enums, decorators, JSX, and tsconfig `paths`, so do not add `tsx` or `ts-node` to run scripts. `vpx --watch <file>` reruns the file when a file it uses changes, in place of `tsx watch`. `vp node <file>` runs plain Node.js.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Healthzkit conventions

- `packages/healthzkit` owns the runner, scheduling, HTTP mapping, output filtering, and public types. `packages/*` contains optional driver adapters; `tools/shared` contains adapter helpers.
- `apps/docs` is the Mintlify docs source. Read its `AGENTS.md` before changing documentation. `apps/example-node` demonstrates long-lived Node deployment; `apps/example-hono` targets Workers.
- Keep adapter factory names, package export subpaths, and peer dependencies consistent with each package's manifest and README. Preserve public API compatibility and add a changeset for publishable changes.
- Adapters must release borrowed connections. Supplied clients remain application-owned; dispose only adapter-owned resources. Cancellation is cooperative: a health deadline does not guarantee driver cancellation.
- Keep external dependencies in readiness examples. Demonstrate real checks, finite driver limits, output filtering, and bounded shutdown for production integrations.
- After code changes, run `vp check` and `vp test`. Build with `vp run -r build` before `vp run test:packages` for exports/declaration changes or `vp run test:docs` for the canonical integration recipe. Real-service tests and prerequisites are documented in `tools/integration/README.md`.
- Mintlify generates the docs indexes. Keep agent guidance in normal navigable pages with descriptions; do not add custom `llms.txt` or `llms-full.txt` overrides.
