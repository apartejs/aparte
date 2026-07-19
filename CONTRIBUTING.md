# Contributing to aparte

Thanks for your interest! aparte is in active bootstrap — the surface changes fast. This guide
covers how work lands.

## Principles

1. **Think before coding.** A 3-4 line plan (problem, approach, what changes, what doesn't) beats
   diving in.
2. **Simplicity first.** Prefer dumb, readable code over clever abstraction. A new layer is
   justified only once duplication crosses three places.
3. **Surgical changes.** One concern per commit — no drive-by refactors.
4. **Goal-driven.** Every change ties to a user-visible behavior or a measurable metric.

## Setup

```bash
pnpm install
pnpm build
pnpm test
```

Requires the pnpm version pinned in `package.json` (`packageManager`) and Node 20+.

## The gate

Every new package or feature lands **behind a green gate**:

- `pnpm test` passes
- `pnpm build` and `pnpm typecheck` succeed for the touched package(s)
- `pnpm lint` is clean
- `pnpm e2e` (browser smoke across the playgrounds) passes for changes touching the
  framework boundary or rendering — it also runs in CI (run `pnpm e2e:install` once
  first to install the Playwright browser)
- packaging is valid (`publint` + are-the-types-wrong) once the package is published
- a docs page exists for public API

## Commits & changesets

- **Conventional commits** (`feat:`, `fix:`, `docs:`, `chore:` …), one concern each.
- Any change to a package's public API or shipped CSS needs a changeset:
  ```bash
  pnpm changeset
  ```
- Never commit `dist/`, `*.tsbuildinfo`, or `.claude/` — they're gitignored; stage explicit files.

## Anti-patterns

- No dependencies in `@aparte/core` (the zero-dep promise).
- No framework code at the repo root — frameworks live only in their wrapper package (peer + dev)
  and its playground.
- No product logic (routing, settings, persistence) in the library.
