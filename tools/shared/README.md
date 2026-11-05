# @healthzkit/shared

Internal shared utilities for the HealthzKit monorepo (adapter result helpers, `MetadataFn`, and `withDisposal`).

## Development

- Install dependencies:

```bash
vp install
```

- Run the unit tests:

```bash
vp test
```

- Build the library:

```bash
vp pack
```

## Adapter disposal helper

`withDisposal(adapter, cleanup)` adds `dispose(): Promise<void>` to an adapter. Disposal waits for active direct checks, attempts cleanup once, and retains its fulfillment or rejection for repeated calls. New checks return a failure after disposal starts. The cleanup callback must only release resources owned by the adapter. Lazy resource initialization should use a shared initialization promise to avoid leaking extra clients when checks run concurrently.

`withDisposal(adapter, cleanup)` installs lifecycle methods on the supplied adapter in place. It preserves identity, prototype methods, and non-enumerable members; `check` must be writable. The returned `check` has the `HealthAdapter` result type, including a failed result after terminal disposal.

If the adapter already defines `dispose`, the helper attempts it with the original receiver alongside the extra cleanup. Both run once after pending checks; multiple cleanup failures are aggregated.
