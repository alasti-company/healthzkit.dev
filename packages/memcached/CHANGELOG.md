# @healthzkit/memcached

## 0.2.0

### Minor Changes

- a145239: Add optional adapter disposal and terminal, idempotent `kit.close()`. Wait for accepted requests and underlying checks before attempting all distinct adapters' cleanup; aggregate cleanup failures without retrying. Preserve reusable scheduling-only `stop()` and check-only adapter compatibility.

  Dispose adapter-owned clients and pools across persistent drivers and AWS SDK v3 without closing supplied clients. Add a shared lifecycle helper, protect lazy initialization against concurrent checks, and use a private Mongoose connection instead of the application's global singleton. Preserve MongoDB adapter `close()` as a reusable reset and add terminal `dispose()` separately.

### Patch Changes

- Updated dependencies [a145239]
  - @healthzkit/shared@0.1.0

## 0.1.0

### Minor Changes

- 7b83d97: Add Memcached readiness adapters for memcached and memjs with lazy client creation, read-only checks, latency metadata, and optional metadata hooks.
