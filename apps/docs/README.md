# Healthzkit docs

Mintlify documentation for [healthzkit.dev](https://healthzkit.dev). Source of truth is this directory (`docs.json` + MDX).

```bash
pnpm --filter @healthzkit/docs dev
```

Or from this directory: `npx mint dev`. Preview: http://localhost:3000

## Writing

See [AGENTS.md](./AGENTS.md). Keep page paths stable so existing `/guide/*` and `/adapter/*` URLs continue to work.

## Agent documentation

Mintlify generates `/llms.txt`, `/llms-full.txt`, and Markdown page exports from the navigation and MDX pages. Do not add custom index files: they override generation and can drift from the API. See [Mintlify's llms.txt documentation](https://www.mintlify.com/docs/ai/llmstxt).

The canonical integration recipe is `guide/integrate-healthzkit.mdx`. After building packages, run `vp run test:docs` from the repository root to compile and exercise its exact TypeScript example. CI runs this check on Node 22 and 24. The check uses a simulated pool; real database coverage lives in the integration suites.

After publishing, verify `/llms.txt` includes `/guide/integrate-healthzkit.md`, `/llms-full.txt` contains the recipe, and the Markdown page is accessible without authentication.

## Publishing

Install the Mintlify GitHub app from the [dashboard](https://dashboard.mintlify.com/settings/organization/github-app) and point the deployment at `apps/docs`. Changes on the default branch publish automatically.
