---
"healthzkit": minor
---

Add Fetch-API helpers (`toFetchResponse`, `createFetchHandler`) so Hono, Next.js, Bun, and Workers can mount `/healthz/live` and `/healthz/ready` without mapping status, headers, and body by hand. `createFetchHandler` answers GET and HEAD on those routes; other methods return 405. Unknown paths return 404 without running checks.
