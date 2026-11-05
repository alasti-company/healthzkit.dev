---
"@healthzkit/redis": patch
---

Keep node-redis adapter declarations compatible with Redis 4, 5, and 6 by describing the required client methods without version-specific RedisClientType generics or RESP exports.
