# healthzkit

Framework-agnostic **liveness** and **readiness** probes for Node.js. Define checks as small adapters; healthzkit runs them in parallel, rolls up status, maps to HTTP responses, and can schedule checks in the background so probes read cached results instead of hitting dependencies on every request.

This monorepo publishes the core library and optional adapters for common data stores.

## Packages

| Package                                       | npm                    | Description                                                                                                                                                                  |
| --------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`healthzkit`](./packages/healthzkit)         | `healthzkit`           | Core probe runner, routing, scheduling, and HTTP mapping                                                                                                                     |
| [`@healthzkit/postgres`](./packages/postgres) | `@healthzkit/postgres` | Adapters for [`pg`](https://node-postgres.com/) and [`postgres`](https://github.com/porsager/postgres)                                                                       |
| [`@healthzkit/redis`](./packages/redis)       | `@healthzkit/redis`    | Adapters for [`ioredis`](https://github.com/redis/ioredis), [`redis`](https://github.com/redis/node-redis), and [`@upstash/redis`](https://github.com/upstash/upstash-redis) |

See each package README for install instructions, API details, and examples.

## Quick start

```bash
npm install healthzkit
```

```ts
import { createHealthKit } from "healthzkit";

const kit = createHealthKit({
  checks: [
    {
      name: "process",
      type: ["liveness"],
      adapter: { check: async () => ({ status: "ok" }) },
    },
    {
      name: "db",
      type: ["readiness"],
      adapter: {
        check: async () => {
          // ping your database, etc.
          return { status: "ok" };
        },
      },
    },
  ],
});

const res = await kit.handleRequest({ path: "/healthz/ready", method: "GET" });
```

Full API documentation: [`packages/healthzkit/README.md`](./packages/healthzkit/README.md).

## Development

Requires [Node.js](https://nodejs.org/) ≥ 22.12 and [pnpm](https://pnpm.io/) (see `packageManager` in `package.json`). Commands use the [Vite+](https://viteplus.dev/) `vp` CLI.

Install dependencies:

```bash
vp install
```

Run tests across all packages:

```bash
vp run -r test
```

Format, lint, and type-check:

```bash
vp check
```

Build all packages:

```bash
vp run -r build
```

Run the full readiness check (format, lint, test, build):

```bash
vp run ready
```

See [`AGENTS.md`](./AGENTS.md) for Vite+ / `vp` conventions used in this repo.
