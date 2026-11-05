# healthzkit

## 0.4.0

### Minor Changes

- 54123ff: Add typed checkLiveness() and checkReadiness() APIs and isolated per-execution completion and status-change hooks. Keep HTTP probes on the same execution path, with diagnostic filtering applied only during serialization.
- 988e41a: Add startup checks and `/healthz/startup` routing, plus `handleStartup()` for direct use. Add idempotent `beginDrain()` to immediately fail readiness with HTTP 503 while keeping liveness and scheduling independent. Document permanent per-instance drain state and scheduling restart semantics. Direct request routing now supports GET/HEAD and rejects unsupported health-route methods with 405.
- a145239: Add optional adapter disposal and terminal, idempotent `kit.close()`. Wait for accepted requests and underlying checks before attempting all distinct adapters' cleanup; aggregate cleanup failures without retrying. Preserve reusable scheduling-only `stop()` and check-only adapter compatibility.
  
  Dispose adapter-owned clients and pools across persistent drivers and AWS SDK v3 without closing supplied clients. Add a shared lifecycle helper, protect lazy initialization against concurrent checks, and use a private Mongoose connection instead of the application's global singleton. Preserve MongoDB adapter `close()` as a reusable reset and add terminal `dispose()` separately.
- 6e236d1: Set `Cache-Control: no-store` on health responses. Add `output.exposeMetadata` omission and scalar JSON Pointer allowlists, and `output.detail: "status"` for status-only JSON or text. Apply error and metadata redaction only when formatting HTTP output so internal rollup diagnostics remain available. Preserve existing diagnostic exposure defaults and document safer settings for public endpoints.

## 0.3.0

### Minor Changes

- ae9ed10: Pass an optional CheckContext with a deadline AbortSignal to adapters. Share in-flight work per check across on-demand requests and scheduled runs, retaining protection after a timeout until the underlying operation settles. Forward the context signal to HTTP fetch requests.

## 0.2.0

### Minor Changes

- e90e971: Validate timeout and scheduling values at construction. Timing values must be integer milliseconds from 1 to 2,147,483,647; invalid values (including zero) now throw a field-specific RangeError rather than relying on runtime timer coercion. Capture nested timing configuration to prevent later mutations from bypassing validation.

### Patch Changes

- 7d5caf8: Honor per-check `onDegraded.httpStatus` when the overall rollup is degraded. The first matching degraded check in configuration order wins over degraded defaults; failed rollups and per-check failure overrides retain precedence. Apply this to effective check statuses after `onFail.treatAs` remapping.

## 0.1.1

### Patch Changes

- 2d6259d: Reject duplicate check names when creating a HealthKit instance so one check cannot hide another check's failure or share its scheduled cache.
- 4beef32: Apply timeouts to scheduled checks, prevent overlapping refreshes, and report stale cached results as failures instead of serving healthy results indefinitely.

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
