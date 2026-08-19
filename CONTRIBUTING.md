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
- **pre-push** — `test` + `build` (scoped to what the diff affects on a branch, full on
  `main` — see below), and it **refuses a direct push to `main`**

Feature work goes on a branch and lands through a PR, so CI gates it before it reaches
`main`. The release flow is the one legitimate exception:
`APARTE_ALLOW_MAIN_PUSH=1 git push --follow-tags origin main`.

`--no-verify` is not a workflow. If a hook fails, the code is wrong, not the hook.

### What the hooks actually run

A push to `main` (the release flow) runs the full `test` + `build`. A **branch** push runs only
what the diff can break — CI runs the full matrix on the PR anyway, so a docs-only push should
not cost 1053 tests and 22 builds. Concretely: the unit suite is skipped when no package with
tests is affected, and the build goes through `nx affected`.

### Making it fit on your machine

The suites are parallel by default, which on a big machine means *very* parallel. Measured on a
32-thread box:

| | default | capped | why |
|---|---|---|---|
| unit (`pnpm test`) | 31 child processes, 13s | 16 processes, 15s | vitest 2 runs each file in a **fork** with its own jsdom; the suite is startup-bound (~7s of actual tests), so the extra workers buy seconds and cost gigabytes |
| e2e (`pnpm e2e`) | 16 browsers, 77s | 8 browsers, ~82s | each worker is a browser, on top of the six dev servers the config boots |
| e2e **in CI** | 3-24 min | ~2.5 min | the job now runs inside `mcr.microsoft.com/playwright:<version>-noble`, so it stops installing browsers and their apt dependencies on every run |
| build (`pnpm build`) | 97s | **3s** | `build` was not a cached nx target: 22 projects rebuilt on every push and every gate |

The caps are in `vitest.config.ts` and `e2e/playwright.config.ts`, and they apply **locally
only** — CI runners have 2-4 cores, where a percentage cap is harmful. Knobs when you want them:

```bash
pnpm exec vitest run --maxWorkers 4 --minWorkers 1   # lower still (min must move too)
E2E_ONLY=react pnpm e2e                              # one playground: one dev server
pnpm exec nx affected -t build --base=origin/main     # what the hook does
```

If a build ever looks suspiciously fast, that is the nx cache doing its job — `nx reset` clears
it. The cache key covers each project's own files, its dependencies' files, and the root
`tsconfig.base.json` / `pnpm-lock.yaml` / `nx.json` (`sharedGlobals`), so touching any of those
invalidates everything, deliberately.

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

## Releasing

Every `@aparte/*` package moves **together, at one version** (`fixed` in
`.changeset/config.json`). Two consequences worth knowing before you write a changeset: the
bump type is the **highest** one in the whole group — a single `minor` anywhere makes all
fifteen minor — and packages with no change of their own are still republished.

That lockstep is why there are two levels of changelog. Each package keeps its own (npm reads
it), and the root **`CHANGELOG.md`** is the human aggregate: one section per version, grouped
by package, with the `Updated dependencies` noise dropped and the along-for-the-ride packages
reduced to a footnote. It is generated — never hand-edited:

```bash
node scripts/gen-root-changelog.mjs          # the current version (part of `pnpm version-packages`)
node scripts/gen-root-changelog.mjs --all    # rebuild every version from the per-package files
```

The flow:

1. **Push to `main`** → `release.yml` opens/updates the *Version Packages* PR. It runs
   `pnpm version-packages`, i.e. `changeset version` **plus** the root-changelog generator, so
   the PR already carries both levels.
   > ⚠️ In pre-release mode (`.changeset/pre.json`), `changeset version` computes from
   > `initialVersions` and applies the group's highest bump — it has proposed a wrong number
   > before. **Check the version in that PR** and correct it there if needed.
2. **Merge it.**
3. **`pnpm release`** locally — builds every package, `changeset publish` (npm + one git tag
   per package), then `scripts/tag-release.mjs` creates the umbrella tag `v<version>`.
4. **`git push origin v<version>`** — that tag, **alone** → `release-notes.yml` creates the
   **one** GitHub Release for that version, with the matching root-changelog section as its
   body.
   > ⚠️ Not `git push --tags`. GitHub drops the tag-push event past **three tags in a single
   > push**, and `changeset publish` has just created fifteen — so `--tags` publishes them all
   > and triggers nothing, with no error anywhere. Push the umbrella tag on its own; the
   > per-package tags can follow in a second push.
5. Verify the dist-tags: `npm view @aparte/core dist-tags`. `release` publishes with
   `--tag alpha`, so `alpha` moves and `latest` stays put — which is what we want while every
   version is a prerelease (`npm i @aparte/core` must not hand someone an alpha by surprise).
   Without that flag, `changeset publish` moved `latest` and left `alpha` on the previous
   version, on all fifteen packages, twice.

## Anti-patterns

- No dependencies in `@aparte/core` (the zero-dep promise).
- No framework code at the repo root — frameworks live only in their wrapper package (peer + dev)
  and its playground.
- No product logic (routing, settings, persistence) in the library.
