---
"@healthzkit/s3": patch
"@healthzkit/dynamo": patch
"@healthzkit/elasticsearch": patch
---

Propagate check cancellation to AWS SDK v3 requests, AWS SDK v2 per-operation
requests, and Elasticsearch cluster health requests without closing shared clients.
Preserve cancellation reasons and request settlement before retrying. Document
cancellation coverage and driver timeout limits across official adapters.
