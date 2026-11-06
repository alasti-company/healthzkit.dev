# @healthzkit/valkey

## 0.1.0

### Minor Changes

- a145239: Add optional adapter disposal and terminal, idempotent `kit.close()`. Wait for accepted requests and underlying checks before attempting all distinct adapters' cleanup; aggregate cleanup failures without retrying. Preserve reusable scheduling-only `stop()` and check-only adapter compatibility.

  Dispose adapter-owned clients and pools across persistent drivers and AWS SDK v3 without closing supplied clients. Add a shared lifecycle helper, protect lazy initialization against concurrent checks, and use a private Mongoose connection instead of the application's global singleton. Preserve MongoDB adapter `close()` as a reusable reset and add terminal `dispose()` separately.

### Patch Changes

- Updated dependencies [a145239]
  - @healthzkit/shared@0.1.0

## 0.0.5

### Patch Changes

- 05b241b: Split ioredis and iovalkey custom commands into command names and arguments so commands such as `ECHO hello` run successfully. Ignore surrounding and repeated whitespace, and reject empty commands.
- @healthzkit/shared@0.0.2

## 0.0.4

### Patch Changes

- 3b0c4b0: Add npm `description`, `keywords`, `homepage`, and `bugs` so the adapters show up in search. Published `engines.node` is `>=22.12.0`, matching CI.
- Updated dependencies [3b0c4b0]
  - @healthzkit/shared@0.0.2

## 0.0.3

### Patch Changes

- 114bf96: Update build toolchain and development dependencies (Vite+ 0.3.0, tsdown 0.23, pnpm 12, changesets 3) and bump every adapter's driver test dependency to its latest release. Peer dependency ranges, package exports and Node engine requirements are unchanged.
- Updated dependencies [114bf96]
  - @healthzkit/shared@0.0.1

## 0.0.2

### Patch Changes

- fb6d62a: fix: dependency resolution for internal shared tooling

## 0.0.1

### Patch Changes

- e42e026: feat: init valkey package
