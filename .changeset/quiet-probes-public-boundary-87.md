---
"healthzkit": minor
---

Set `Cache-Control: no-store` on health responses. Add `output.exposeMetadata` omission and scalar JSON Pointer allowlists, and `output.detail: "status"` for status-only JSON or text. Apply error and metadata redaction only when formatting HTTP output so internal rollup diagnostics remain available. Preserve existing diagnostic exposure defaults and document safer settings for public endpoints.
