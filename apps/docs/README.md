# Docs site

VitePress site for [healthzkit.dev](https://healthzkit.dev), deployed as a Cloudflare Worker with static assets.

## Scripts

| Script                    | Command                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| `pnpm run dev`            | VitePress dev server                                               |
| `pnpm run build`          | VitePress production build into `.vitepress/dist`                  |
| `pnpm run preview`        | Preview the production build locally                               |
| `pnpm run deploy`         | Publish with the **workspace** `wrangler` (after `pnpm run build`) |
| `pnpm run deploy:preview` | Upload a preview version (`wrangler versions upload`)              |

## Cloudflare Workers Builds

Root directory is `apps/docs`. Do **not** set the deploy command to `pnpm dlx wrangler deploy` (or `pnpm dlx wrangler versions upload`). That installs a second wrangler into an isolated pnpm store and fails on pnpm 12 with `ERR_PNPM_IGNORED_BUILDS` for `esbuild` and `workerd`.

Use the wrangler already installed as a docs `devDependency`:

| Setting                       | Value                     |
| ----------------------------- | ------------------------- |
| Root directory                | `apps/docs`               |
| Build command                 | `pnpm run build`          |
| Deploy command                | `pnpm run deploy`         |
| Non-production deploy command | `pnpm run deploy:preview` |

Workers Builds does not read custom build commands from `wrangler.jsonc`; these values live in the Worker dashboard under **Settings → Build**.
