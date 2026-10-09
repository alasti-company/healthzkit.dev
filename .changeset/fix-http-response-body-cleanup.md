---
"@healthzkit/http": patch
---

Release HTTP response bodies after metadata handling, including unexpected status codes and metadata errors, so streaming responses do not leave connections open after checks complete.
