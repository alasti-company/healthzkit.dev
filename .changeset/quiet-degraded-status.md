---
"healthzkit": patch
---

Honor per-check `onDegraded.httpStatus` when the overall rollup is degraded. The first matching degraded check in configuration order wins over degraded defaults; failed rollups and per-check failure overrides retain precedence. Apply this to effective check statuses after `onFail.treatAs` remapping.
