# Docs site

VitePress site for [healthzkit.dev](https://healthzkit.dev), deployed as a Cloudflare Worker with static assets.

## Scripts

| Script             | Command                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `pnpm run dev`     | VitePress dev server                                               |
| `pnpm run build`   | VitePress production build into `.vitepress/dist`                  |
| `pnpm run preview` | Preview the production build locally                               |
| `pnpm run deploy`  | Publish with the **workspace** `wrangler` (after `pnpm run build`) |

## Cloudflare Workers Builds

Root directory is `apps/docs`. Do **not** set the deploy command to `pnpm dlx wrangler deploy`. That installs a second wrangler into an isolated pnpm store and fails on pnpm 12 with `ERR_PNPM_IGNORED_BUILDS` for `esbuild` and `workerd`.

Use the wrangler already installed as a docs `devDependency`:

| Setting        | Value             |
| -------------- | ----------------- |
| Root directory | `apps/docs`       |
| Build command  | `pnpm run build`  |
| Deploy command | `pnpm run deploy` |

Turn **off** non-production branch builds. `preview_urls`, `workers_dev`, and the custom-domain `previews_enabled` flag are all `false`, so `wrangler versions upload` would store a version with no reachable preview URL.

Workers Builds does not read custom build commands from `wrangler.jsonc`; these values live in the Worker dashboard under **Settings → Build**.

## GitHub Actions

`.github/workflows/deploy-docs.yml` publishes with the workspace `wrangler` on pushes to `main` that touch the docs app (and via **workflow_dispatch**). That path does not use `pnpm dlx`.

Add repository secrets `CLOUDFLARE_API_TOKEN` (Workers edit) and `CLOUDFLARE_ACCOUNT_ID` before the first run.
