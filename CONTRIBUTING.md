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

Every change lands **behind a green gate**. One command runs it:

```bash
pnpm gate        # lint + typecheck + test + build + packaging (publint/attw)
pnpm gate:full   # the above + pnpm e2e (run `pnpm e2e:install` once first)
```

Run `gate:full` for anything touching the framework boundary, rendering, or before a
release; `pnpm gate` otherwise. A public API also needs a docs page, and any change to a
package's public API or shipped CSS needs a changeset.

### It's enforced, not trusted

`pnpm install` points git at `.githooks/` (via the root `prepare` script), so:

- **pre-commit** — `lint` + `typecheck` (both incremental; a no-op commit costs seconds)
- **pre-push** — `test` + `build`, and it **refuses a direct push to `main`**

Feature work goes on a branch and lands through a PR, so CI gates it before it reaches
`main`. The release flow is the one legitimate exception:
`APARTE_ALLOW_MAIN_PUSH=1 git push --follow-tags origin main`.

`--no-verify` is not a workflow. If a hook fails, the code is wrong, not the hook.

> **Maintainers:** the client-side hook is a courtesy, not a guarantee — `main` must also
> carry a GitHub ruleset (Settings → Rules → Rulesets): require a PR, require the `ci`,
> `test-matrix` and `e2e` checks, block force-pushes.

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
