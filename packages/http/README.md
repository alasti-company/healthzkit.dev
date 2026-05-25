# @healthzkit/http

HTTP health adapters for [healthzkit](https://healthzkit.dev). The adapter sends a request with the global **`fetch`** API, treats configured status codes as success, and returns **`ok`** with round-trip latency and the response status code in metadata.

Requires a runtime with **`fetch`** (Node.js 18+). No extra client dependencies.

## Install

```bash
npm install healthzkit @healthzkit/http
```

The package is ESM-only (`"type": "module"`).

## Quick start

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

Use a subpath import when you want a dedicated entry for bundlers:

| Import                  | Exports       |
| ----------------------- | ------------- |
| `@healthzkit/http`      | `httpAdapter` |
| `@healthzkit/http/http` | `httpAdapter` |

Both resolve to the same factory.

## `httpAdapter`

Each check issues one **`fetch`** to **`url`**. By default the method is **`GET`**, success status codes are **`200`** and **`204`**, and the request times out after **5000** ms.

### Basic probe

```ts
import { httpAdapter } from "@healthzkit/http";

const adapter = httpAdapter({
  url: "https://api.example/ready",
  headers: { Authorization: `Bearer ${process.env.API_TOKEN}` },
});
```

### POST with body and custom success codes

```ts
const adapter = httpAdapter({
  url: "https://api.example/health",
  method: "POST",
  body: JSON.stringify({ probe: true }),
  headers: { "Content-Type": "application/json" },
  expectedStatusCodes: [200],
  timeout: 3000,
});
```

### Response metadata

Optional **`metadata`** receives the **`Response`** and can return extra fields (sync or async) merged into check metadata alongside **`latencyMs`** and **`statusCode`**.

```ts
const adapter = httpAdapter({
  url: "https://api.example/health",
  metadata: async (res) => ({
    contentType: res.headers.get("content-type") ?? undefined,
  }),
});
```

## Options

| Option                    | Description                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------- |
| **`url`**                 | Target URL (`string` or `URL`). Required.                                              |
| **`method`**              | HTTP method. Default **`GET`**.                                                        |
| **`headers`**             | Request headers.                                                                       |
| **`body`**                | Request body for POST, PUT, or PATCH (`string` or `Uint8Array`).                       |
| **`expectedStatusCodes`** | Status codes treated as success. Default **`[200, 204]`**.                             |
| **`timeout`**             | Request timeout in ms. Default **5000**. Aborts with a clear timeout error.            |
| **`followRedirects`**     | When **`false`**, uses `redirect: "manual"`. Default **`true`** (follow redirects).    |
| **`metadata`**            | Optional `(response) => Record<string, unknown>` (sync or async) merged into metadata. |

Unexpected status codes return **`fail`** with a message like `Unexpected status code: 503 Service Unavailable`. Network errors and other thrown values return **`fail`** with the caught error.

## Check result

On success:

```json
{
  "status": "ok",
  "metadata": {
    "latencyMs": 42,
    "statusCode": 200
  }
}
```

On failure, `status` is **`fail`** and `error` is set (see [healthzkit](https://healthzkit.dev) for how that rolls up into probe responses).

## Scheduling

For upstream HTTP APIs that should not be called on every probe, pair this adapter with a **`schedule`** on the check so readiness reads cached results. See the **Scheduling** section in the `healthzkit` README.

## Development (this repo)

From the package directory:

```bash
vp install
vp test
vp pack
```

See the repo root `AGENTS.md` for Vite+ / `vp` conventions.
