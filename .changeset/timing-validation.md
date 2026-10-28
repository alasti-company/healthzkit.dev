---
"healthzkit": minor
---

Validate timeout and scheduling values at construction. Timing values must be integer milliseconds from 1 to 2,147,483,647; invalid values (including zero) now throw a field-specific RangeError rather than relying on runtime timer coercion. Capture nested timing configuration to prevent later mutations from bypassing validation.
