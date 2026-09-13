# healthzkit

## 0.1.0

### Minor Changes

- 3b0c4b0: Add Fetch-API helpers (`toFetchResponse`, `createFetchHandler`) so Hono, Next.js, Bun, and Workers can mount `/healthz/live` and `/healthz/ready` without mapping status, headers, and body by hand. `createFetchHandler` answers GET and HEAD on those routes; other methods return 405. Unknown paths return 404 without running checks.

### Patch Changes

- 3b0c4b0: Add npm `description`, `keywords`, `homepage`, and `bugs` so the adapters show up in search. Published `engines.node` is `>=22.12.0`, matching CI.

## 0.0.4

### Patch Changes

- 114bf96: Update build toolchain and development dependencies (Vite+ 0.3.0, tsdown 0.23, pnpm 12, changesets 3) and bump every adapter's driver test dependency to its latest release. Peer dependency ranges, package exports and Node engine requirements are unchanged.

## 0.0.3

### Patch Changes

- 419ebb1: chore: update dev deps

## 0.0.2

### Patch Changes

- c69f281: chore: sync versions and add readmes

## 0.0.1

### Patch Changes

- initial release
