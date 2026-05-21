---
title: Responses and HTTP
description: Understand Healthzkit rollup rules, HTTP status codes for liveness and readiness, JSON versus plain-text output, base paths, and public TypeScript types from the core package.
---

# Responses and HTTP

## Rollup status

Overall `HealthResponse.status` is computed from all check results for that probe:

1. Any **`fail`** → **`fail`** (unless remapped by `onFail.treatAs` on that check).
2. Else any **`degraded`** → **`degraded`**.
3. Else **`ok`**.

Override with `rollup.computeStatus(results)` for custom rules.

## HTTP status

Response **`status`** (HTTP code) is derived from the rolled-up health status and your config:

- Any check with **`status === "fail"`** and **`onFail.httpStatus`** set → that value is returned (first matching check in config order wins among failed checks with a custom status).
- Else if rollup is **`fail`**: `defaults.onFail.httpStatus` or **503**.
- Else if rollup is **`degraded`**: `defaults.onDegraded.httpStatus` or **200**.
- Else **200**.

`onFail.treatAs` changes the **check** status used for rollup and the JSON/text body; combine with `onFail.httpStatus` or defaults when you need a specific HTTP code.

## Output

`output` on the root config:

- **`format`**: `"json"` (default) or `"text"`.
  - JSON: `Content-Type: application/json`, body is `JSON.stringify` of `HealthResponse`.
  - Text: `Content-Type: text/plain`, human-readable lines (`status:`, then each check with latency and optional error).
- **`exposeError`**: Default **true**. If **false**, the `error` field is omitted from each check in the payload.

## Public API overview

**Runtime**

- `createHealthKit(config)` → `HealthKit`
- `HealthKit`: `start()`, `stop()`, `handleRequest(req)`, `handleLiveness()`, `handleReadiness()`

**Types**

- `HealthkitConfig`, `CheckConfig`, `HealthAdapter`, `AdapterResult`, `CheckResult`, `HealthResponse`
- `CheckStatus`, `CheckType`, `RollupConfig`, `OutputConfig`, `DefaultsConfig`
- `AgnosticRequest`, `AgnosticResponse`

The canonical type definitions and any future additions live in the `healthzkit` package under `packages/healthzkit` in this monorepo.
