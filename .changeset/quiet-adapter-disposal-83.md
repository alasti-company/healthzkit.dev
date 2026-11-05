---
"healthzkit": minor
"@healthzkit/cockroach": minor
"@healthzkit/dynamo": minor
"@healthzkit/elasticsearch": minor
"@healthzkit/kafka": minor
"@healthzkit/memcached": minor
"@healthzkit/mongo": minor
"@healthzkit/mysql": minor
"@healthzkit/postgres": minor
"@healthzkit/rabbitmq": minor
"@healthzkit/redis": minor
"@healthzkit/s3": minor
"@healthzkit/sqlite": minor
"@healthzkit/valkey": minor
"@healthzkit/shared": minor
---

Add optional adapter disposal and terminal, idempotent `kit.close()`. Wait for accepted requests and underlying checks before attempting all distinct adapters' cleanup; aggregate cleanup failures without retrying. Preserve reusable scheduling-only `stop()` and check-only adapter compatibility.

Dispose adapter-owned clients and pools across persistent drivers and AWS SDK v3 without closing supplied clients. Add a shared lifecycle helper, protect lazy initialization against concurrent checks, and use a private Mongoose connection instead of the application's global singleton. Preserve MongoDB adapter `close()` as a reusable reset and add terminal `dispose()` separately.
