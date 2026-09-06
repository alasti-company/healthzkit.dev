---
"healthzkit": patch
"@healthzkit/shared": patch
"@healthzkit/cockroach": patch
"@healthzkit/drizzle": patch
"@healthzkit/dynamo": patch
"@healthzkit/elasticsearch": patch
"@healthzkit/http": patch
"@healthzkit/kafka": patch
"@healthzkit/minio": patch
"@healthzkit/mongo": patch
"@healthzkit/mysql": patch
"@healthzkit/postgres": patch
"@healthzkit/prisma": patch
"@healthzkit/rabbitmq": patch
"@healthzkit/redis": patch
"@healthzkit/s3": patch
"@healthzkit/sqlite": patch
"@healthzkit/valkey": patch
---

Update build toolchain and development dependencies (Vite+ 0.3.0, tsdown 0.23, pnpm 12, changesets 3) and bump every adapter's driver test dependency to its latest release. Peer dependency ranges, package exports and Node engine requirements are unchanged.
