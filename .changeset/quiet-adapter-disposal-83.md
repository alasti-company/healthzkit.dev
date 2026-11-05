---
"healthzkit": minor
"@healthzkit/cockroach": patch
"@healthzkit/dynamo": patch
"@healthzkit/elasticsearch": patch
"@healthzkit/kafka": patch
"@healthzkit/memcached": patch
"@healthzkit/mongo": patch
"@healthzkit/mysql": patch
"@healthzkit/postgres": patch
"@healthzkit/rabbitmq": patch
"@healthzkit/redis": patch
"@healthzkit/s3": patch
"@healthzkit/sqlite": patch
"@healthzkit/valkey": patch
"@healthzkit/shared": minor
---

Add optional adapter disposal and terminal, idempotent `kit.close()`. Wait for accepted requests and underlying checks before attempting all distinct adapters' cleanup; aggregate cleanup failures without retrying. Preserve reusable scheduling-only `stop()` and check-only adapter compatibility.

Dispose adapter-owned clients and pools across persistent drivers and AWS SDK v3 without closing supplied clients. Add a shared lifecycle helper, protect lazy initialization against concurrent checks, and use a private Mongoose connection instead of the application's global singleton. Preserve MongoDB adapter `close()` as a reusable reset and add terminal `dispose()` separately.
