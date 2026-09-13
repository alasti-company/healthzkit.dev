---
"healthzkit": minor
"@healthzkit/shared": patch
"@healthzkit/postgres": patch
"@healthzkit/cockroach": patch
"@healthzkit/redis": patch
"@healthzkit/valkey": patch
"@healthzkit/mongo": patch
"@healthzkit/mysql": patch
"@healthzkit/sqlite": patch
"@healthzkit/dynamo": patch
"@healthzkit/s3": patch
"@healthzkit/minio": patch
"@healthzkit/rabbitmq": patch
"@healthzkit/kafka": patch
"@healthzkit/elasticsearch": patch
"@healthzkit/http": patch
"@healthzkit/drizzle": patch
"@healthzkit/prisma": patch
---

Improve npm discoverability (description, keywords, homepage, engines) and add Fetch-API helpers (`toFetchResponse`, `createFetchHandler`) so Hono, Next.js, Bun, and Workers can mount `/healthz/live` and `/healthz/ready` in a few lines.
