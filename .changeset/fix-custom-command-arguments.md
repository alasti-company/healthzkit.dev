---
"@healthzkit/redis": patch
"@healthzkit/valkey": patch
---

Split ioredis and iovalkey custom commands into command names and arguments so commands such as `ECHO hello` run successfully. Ignore surrounding and repeated whitespace, and reject empty commands.
