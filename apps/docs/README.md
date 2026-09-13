# Healthzkit docs

Mintlify documentation for [healthzkit.dev](https://healthzkit.dev). Source of truth is this directory (`docs.json` + MDX).

```bash
pnpm --filter @healthzkit/docs dev
```

Or from this directory: `npx mint dev`. Preview: http://localhost:3000

## Writing

See [AGENTS.md](./AGENTS.md). Keep page paths stable so existing `/guide/*` and `/adapter/*` URLs continue to work.

## Publishing

Install the Mintlify GitHub app from the [dashboard](https://dashboard.mintlify.com/settings/organization/github-app) and point the deployment at `apps/docs`. Changes on the default branch publish automatically.
