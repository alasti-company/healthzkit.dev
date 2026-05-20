# Checks and adapters

## `CheckConfig`

Each check is a `CheckConfig` entry in the `checks` array on the root config:

| Field            | Purpose                                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`name`**       | Key in the response `checks` object.                                                                                                                                                   |
| **`type`**       | One or both of `"liveness"` and `"readiness"`. Only checks that include the probe type run for that probe. If none match, the response is still **200** with an empty `checks` object. |
| **`adapter`**    | Must implement `HealthAdapter`: `check(): Promise<AdapterResult>`.                                                                                                                     |
| **`timeout`**    | Per-check timeout in milliseconds. Default **5000**, unless overridden by `defaults.timeout`.                                                                                          |
| **`schedule`**   | Optional `{ intervalMs }`. When `kit.start()` has been called, the adapter runs on that interval and results are **cached** (see [Scheduling](./scheduling.md)).                       |
| **`onFail`**     | Optional `httpStatus`, `treatAs` (for example map `"fail"` to `"degraded"` for rollup and body while adjusting HTTP rules).                                                            |
| **`onDegraded`** | Present on the type; degraded HTTP status for the overall response is controlled via **`defaults.onDegraded`** (see [Responses and HTTP](./responses-and-http.md)).                    |

## `AdapterResult`

Each `adapter.check()` resolves to:

- **`status`**: `"ok" | "degraded" | "fail"`.
- **`error`**: Optional `Error` or string (included in the serialized check unless `output.exposeError` is `false`).
- **`metadata`**: Optional object merged into the check result.

Thrown errors from `adapter.check()` are treated as **`fail`**, with the error message captured when `exposeError` is true.

## Official adapters

This monorepo publishes optional packages that return a `HealthAdapter` for common infrastructure:

- [Redis](./adapters-redis.md) — `@healthzkit/redis`
- [Postgres](./adapters-postgres.md) — `@healthzkit/postgres`
- [MySQL](./adapters-mysql.md) — `@healthzkit/mysql`
- [MongoDB](./adapters-mongo.md) — `@healthzkit/mongo`
- [SQLite](./adapters-sqlite.md) — `@healthzkit/sqlite`
- [DynamoDB](./adapters-dynamo.md) — `@healthzkit/dynamo`
