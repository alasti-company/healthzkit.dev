---
"healthzkit": minor
---

Add opt-in `schedule.jitterMs` so scheduled checks can start at different times on each replica. Omit it, or set 0, to keep an immediate fixed interval. Each initial run waits a uniform delay from 0 through `jitterMs` milliseconds, and each refresh waits `intervalMs` plus a new delay of that size. `jitterMs` cannot exceed `intervalMs`. A cached success becomes stale at `intervalMs + jitterMs + timeout`. Check deadlines stay the same, and a probe does not wait out a pending initial delay. ([#100](https://github.com/alasti-company/healthzkit.dev/issues/100))
