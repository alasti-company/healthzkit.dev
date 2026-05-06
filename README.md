# Vite+ Monorepo Starter

A Vite+ starter for building a monorepo with the unified `vp` toolchain.

## Setup

- Install dependencies:

```bash
vp install
```

- Start all development workspaces:

```bash
vp run dev
```

## Helpful commands

- Install/update dependencies after pulling changes:

```bash
vp install
```

- Run the workspace test suite:

```bash
vp run test -r
```

- Run formatting, linting, and type checks:

```bash
vp check
```

- Build all packages/apps in the monorepo:

```bash
vp run build -r
```

- Run a project-wide readiness check:

```bash
vp run ready
```
