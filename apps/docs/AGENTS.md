# Documentation project instructions

This is the Healthzkit docs site on [Mintlify](https://mintlify.com). Pages are MDX with YAML frontmatter. Navigation and branding live in `docs.json`.

## About this product

Healthzkit is a framework-agnostic library for Kubernetes-style liveness and readiness probes in Node.js. You define checks as adapters; the core package runs them in parallel, rolls up status, maps HTTP responses, and can schedule background refresh.

- Site: https://healthzkit.dev
- npm: https://www.npmjs.com/package/healthzkit
- Source: https://github.com/alasti-company/healthzkit.dev
- Runtime: Node.js 22.12+, ESM-only

Examples should match `packages/healthzkit` and the adapter packages. Prefer real factory names (`pgAdapter`, `ioredisAdapter`, `createFetchHandler`) over placeholders.

## Terminology

| Prefer                         | Avoid                                      |
| ------------------------------ | ------------------------------------------ |
| healthzkit (package / CLI-ish) | HealthzKit, healthz-kit                    |
| Healthzkit (product name)      | Healthz Kit                                |
| check                          | probe (except when talking about kubelet)  |
| adapter                        | plugin, driver wrapper                     |
| liveness / readiness           | live check / ready check (except in paths) |
| `basePath`                     | prefix (except framework route prefixes)   |
| rollup                         | aggregate (except as an alias once)        |

- Core package: `healthzkit`
- Adapter packages: `@healthzkit/<name>`
- Default routes: `{basePath}/live` and `{basePath}/ready` (`basePath` defaults to `/healthz`)

## Style preferences

- Use active voice and second person ("you")
- Keep sentences concise — one idea per sentence
- Use sentence case for headings
- Bold for UI elements: Click **Settings**
- Code formatting for file names, commands, paths, and code references
- Show a full copy-pasteable example before splitting it into options
- Link to [Scheduling](/guide/scheduling) from adapters that hit a network or database

## Content boundaries

- Document the core API, HTTP mapping, scheduling, framework wiring, and official adapters
- Do not document unpublished adapters, internal CI, or Cloudflare Workers deploy leftovers from the old VitePress site
