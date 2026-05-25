---
title: HTTP adapter
description: Use @healthzkit/http to probe HTTP and HTTPS endpoints with fetch—status codes, timeouts, redirects, optional response metadata, and Healthzkit readiness examples.
---

# HTTP adapter (`@healthzkit/http`)

The **`@healthzkit/http`** package provides a [`HealthAdapter`](/guide/checks-and-adapters) that probes an HTTP or HTTPS endpoint with the global **[`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)** API. Each check records round-trip latency, validates the response status against **`expectedStatusCodes`**, and returns **`ok`** with **`metadata.statusCode`** and **`metadata.latencyMs`** on success. Unexpected status codes, timeouts, and transport errors return **`fail`** with the caught error.

Requires a runtime with **`fetch`** (Node.js 18+). No peer client package.

## Install

```bash
pnpm add @healthzkit/http healthzkit
```

## Package entrypoints

- **`@healthzkit/http`** — `httpAdapter` and option types.
- **`@healthzkit/http/http`** — `httpAdapter` only.

Both resolve to the same factory. Use the subpath when you want a dedicated entry for bundlers.

## Shared options

`BaseHttpOptions`:

| Option         | Description                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| **`metadata`** | Optional `(response) => Record<string, unknown>` (sync or async) merged into metadata with `latencyMs`. |

## `httpAdapter`

### Defaults

| Setting                   | Default          |
| ------------------------- | ---------------- |
| **`method`**              | **`GET`**        |
| **`expectedStatusCodes`** | **`[200, 204]`** |
| **`timeout`**             | **5000** ms      |
| **`followRedirects`**     | **`true`**       |

### Basic readiness check

```ts
import { createHealthKit } from "healthzkit";
import { httpAdapter } from "@healthzkit/http";

const kit = createHealthKit({
  checks: [
    {
      name: "api",
      type: ["readiness"],
      adapter: httpAdapter({
        url: process.env.API_HEALTH_URL ?? "https://api.example/health",
      }),
    },
  ],
});
```

### Authenticated POST probe

```ts
import { httpAdapter } from "@healthzkit/http/http";

const adapter = httpAdapter({
  url: "https://api.example/health",
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.API_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ probe: true }),
  expectedStatusCodes: [200],
  timeout: 3000,
});
```

### Redirects and metadata

Set **`followRedirects: false`** to use `redirect: "manual"` (useful when you need to detect redirects explicitly). Use **`metadata`** to read headers or body-related facts from the **`Response`**:

```ts
const adapter = httpAdapter({
  url: "https://api.example/health",
  metadata: async (res) => ({
    contentType: res.headers.get("content-type") ?? undefined,
  }),
});
```

## Check metadata

Successful checks include the HTTP status alongside any custom **`metadata`** hook output:

```json
{
  "status": "ok",
  "metadata": {
    "latencyMs": 42,
    "statusCode": 200
  }
}
```

A non-matching status (for example **503**) yields **`fail`** with a message like `Unexpected status code: 503 Service Unavailable`. Request timeouts abort via **`AbortSignal`** and return **`fail`** with `Request timed out after <timeout>ms`.

## Wiring into `createHealthKit`

Treat the factory return value as **`adapter`** on a check (same as a hand-written `{ check() { ... } }` object):

```ts
adapter: httpAdapter({ url: "https://payments.example/ready" }),
```

Combine with **`schedule`** on the check if you want cached readiness results instead of calling the upstream on every probe (see [Scheduling](/guide/scheduling)).
