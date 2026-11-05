---
"healthzkit": minor
"@healthzkit/http": patch
---

Pass an optional CheckContext with a deadline AbortSignal to adapters. Share in-flight work per check across on-demand requests and scheduled runs, retaining protection after a timeout until the underlying operation settles. Forward the context signal to HTTP fetch requests.
