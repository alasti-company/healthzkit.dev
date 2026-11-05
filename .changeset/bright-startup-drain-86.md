---
"healthzkit": minor
---

Add startup checks and `/healthz/startup` routing, plus `handleStartup()` for direct use. Add idempotent `beginDrain()` to immediately fail readiness with HTTP 503 while keeping liveness and scheduling independent. Document permanent per-instance drain state and scheduling restart semantics. Direct request routing now supports GET/HEAD and rejects unsupported health-route methods with 405.
