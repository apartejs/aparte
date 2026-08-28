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
pnpm gate        # lint + typecheck + test + build + packaging + published READMEs
pnpm gate:full   # the above + pnpm e2e (run `pnpm e2e:install` once first)
```

Run `gate:full` for anything touching the framework boundary, rendering, or before a
release; `pnpm gate` otherwise. A public API also needs a docs page, and any change to a
package's public API or shipped CSS needs a changeset.

`check:readmes` is the odd one out: `publint`/`attw` check a package's *shape*, and this
checks its *claims* — a published README may not say "not yet published", "pre-alpha",
"coming soon" or carry a TODO. `@aparte/core`'s README announced "🚧 Pre-alpha — not yet
published to npm" across four npm releases, on the page npm itself was serving. Nothing
was wrong with the package; the first line a visitor read was false, and no gate was
looking at the words.

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
E2E_ONLY=react pnpm e2e                              # one example: one dev server
pnpm exec nx affected -t build --base=origin/main     # what the hook does
```

If a build ever looks suspiciously fast, that is the nx cache doing its job — `nx reset` clears
it. The cache key covers each project's own files, its dependencies' files, and the root
`tsconfig.base.json` / `pnpm-lock.yaml` / `nx.json` (`sharedGlobals`), so touching any of those
invalidates everything, deliberately.

> **Maintainers:** the client-side hook is a courtesy, not a guarantee — `main` must also
> carry a GitHub ruleset (Settings → Rules → Rulesets): require a PR, require the `ci`,
> `test-matrix` and `e2e` checks, block force-pushes.

A **Version PR skips the browser suite**, and only that: `e2e` stays a required check, so
the job still runs and still reports — a skipped job never reports at all, and main's
ruleset would block every release PR forever. What is conditional is the install, the
build and the suite itself.

The rule is "does this diff touch anything a browser could notice": everything except
`.changeset/*`, `CHANGELOG.md` and the version-and-peer-floor lines of a `package.json`.
A manifest that changes for a real reason — a dependency, an exports map — still counts.
It fails OPEN: no base, a first push, an unreadable diff, and the suite runs. Ten wasted
minutes is cheaper than a regression reaching `main`.

The decision runs in its **own job**, on a plain runner, because the `e2e` job runs inside
the Playwright container where `actions/checkout` has no git and downloads a tarball —
there is no `.git` there at all. The first version asked `git diff` inside that container,
got "Not a git repository", swallowed it with `|| true`, read the empty result as "nothing
changed", and skipped the browser suite on a pull request full of source. It reported
green in 33 seconds. Every command is now checked with `if !` rather than `|| true`: a
diff that fails and a diff that finds nothing produce the same empty string, and telling
them apart is the difference between failing open and failing shut.

0.13.0's Version PR was 113 files and not one of them was source.

## Commits & changesets

- **Conventional commits** (`feat:`, `fix:`, `docs:`, `chore:` …), one concern each.
- Any change to a package's public API or shipped CSS needs a changeset:
  ```bash
  pnpm changeset
  ```
- Never commit `dist/`, `*.tsbuildinfo`, or `.claude/` — they're gitignored; stage explicit files.

### How a changeset reads

A changeset becomes a CHANGELOG entry, which becomes the GitHub Release body. Its reader
is evaluating the library with ten seconds to spare, and their question is always the
same: **do I have to touch my code?** Answer that first.

- **The first line is the change, for the caller, at the top.** Plain, imperative, no
  metaphor, and short enough to scan in one pass. It is a summary line, not an opening
  sentence — the paragraph that follows may repeat it at length.
- **Everything else goes below it**: the reasoning, the measurement, the WCAG clause, the
  history. None of it is cut — this repo's changelogs say *why*, and they should. It is
  ordered, so the reader who needs only the first line never pays for the rest.
- **A fix says what was broken from the outside**, not which function was wrong. "The
  keyboard could not archive a conversation" beats "the row's keydown handler climbed to
  closest()". The mechanism belongs on line three.

The failure mode is not vagueness, it is elegance. `A panel says whether the composer's
button has an act, and a single choice settles on the click` is accurate, compact and
has to be read twice — while `Single-choice questions now answer on the click; there is no
submit button to press` says the same thing to someone who is skimming. The rigour that
makes the work good is what makes it hard to scan, and only the ORDER fixes that.

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
   > **Check the version anyway.** Every release up to 0.5.0-alpha.0 had to have its number
   > corrected by hand (~46 files), because `changeset version` proposed `1.0.0` for any
   > feature release. That is fixed — the three causes, all measured rather than inferred,
   > are worth knowing so nobody reintroduces one:
   >
   > 1. **`workspace:*` in `peerDependencies` is an exact pin to changesets**, not a wildcard
   >    (its source: `case "*": versionRange = dependencyRelease.oldVersion`). Any bump left
   >    the range, and a peer dependent leaving the range is bumped **major**. Fourteen
   >    packages declare `@aparte/core` as a peer, so all fourteen majored, and `fixed`
   >    aligned the group on the highest bump. They now carry a literal
   >    `>=0.5.0-alpha.0 <1.0.0`, which a 0.x bump stays inside — and which is a better
   >    published contract than a pin that forbade combinations that work.
   > 2. **`onlyUpdatePeerDependentsWhenOutOfRange`** must be on (in
   >    `.changeset/config.json`), or peer dependents are majored whether or not they left
   >    the range.
   > 3. **Prerelease versions cannot satisfy any range.** With `-alpha.N` numbers, semver's
   >    prerelease rule makes `0.6.0-alpha.0` fail `*`, `0.x`, `>=0.5.0 <1.0.0` — every form —
   >    so the escalation came back at the next minor no matter what. That is why the repo
   >    **left changesets' pre mode**: versions are plain (`0.6.0`, `0.6.1`), and the alpha
   >    channel lives in the npm dist-tag and in the README instead of in the number.
   >
   > Leaving pre mode also restored `changeset publish --tag alpha`, which pre mode refuses.
2. **Merge it.**
3. **`pnpm release`** locally — `prerelease-checks` first, then it builds every package,
   `changeset publish` (npm + one git tag per package), **`scripts/align-dist-tags.mjs`**,
   then `scripts/tag-release.mjs` creates the umbrella tag `v<version>`.
   > It does **not** re-run `gate:full`. It used to, and that was a third full validation of
   > one commit — CI had just judged the identical tree on the version PR, and judged it
   > again on `main`. `prerelease-checks` asks GitHub for the `ci` verdict on `HEAD`'s exact
   > SHA instead, and refuses if it is red, still running, or absent. Better evidence as well
   > as faster: CI runs on `ubuntu-latest`, and 0.13.0 shipped a defect only a POSIX build
   > could expose. It was published at 22:52 from a commit whose CI failed at 22:58.
4. **`git push origin v<version>`** — that tag, **alone** → `release-notes.yml` creates the
   **one** GitHub Release for that version, with the matching root-changelog section as its
   body.
   > ⚠️ Not `git push --tags`. GitHub drops the tag-push event past **three tags in a single
   > push**, and `changeset publish` has just created fifteen — so `--tags` publishes them all
   > and triggers nothing, with no error anywhere. Push the umbrella tag on its own; the
   > per-package tags can follow in a second push.
5. Verify the dist-tags: `npm view @aparte/core dist-tags`. **Both** must be the version you
   just shipped.
   > The tags drifted on three releases in a row (0.3.0, 0.4.0, 0.5.0): `changeset publish`
   > moved `latest` and left `alpha` behind, so `npm i @aparte/core@alpha` served the version
   > before. `pnpm release` now passes `--tag alpha` **and** runs
   > `scripts/align-dist-tags.mjs`, which checks both tags on all fifteen packages, prints
   > what it moves, and exits non-zero on any failure — its first version silently reported
   > "15 already correct" while doing nothing, because Node cannot spawn `npm.cmd` without a
   > shell.
   >
   > `latest` follows the alpha channel on purpose: there is no stable line yet, `latest`
   > already pointed at an alpha, and freezing it would only serve older bits to a bare
   > `npm i @aparte/core`. The day a stable line exists, `latest` stops following — and
   > that is the day to change that script.

## Styling

`@aparte/core` renders into the **light DOM**. There is no shadow root anywhere, which
means two things at once: every class we emit is a public theming surface a consumer may
target, and every selector we write can reach elements we did not render. Both halves
have bitten us, so the rules below are enforced by `pnpm check:derived-vars` rather than
left to review.

**Where CSS goes.** `packages/core/src/styles/`, one sheet per family — never a
`getStyles()` template literal. That seam exists only for a *consumer's* renderer, which
has no other way onto the page. CSS in a template literal is not read as CSS: a backtick
closes the literal, and a `//` comment is just text that ends up rendered.

**The import order in `src/index.ts` is the cascade.** It is the single source of that
order; `scripts/core-stylesheets.mjs` derives the list for everything that reads the
sheets. If you add a sheet, add it to the import block and to `styles/bundle.css` — the
one list that cannot derive itself, and which the guard therefore asserts matches.

**Class names are prefixed `aparte-`.** The one exception is `language-*` on a code
block, which is the name highlighters look for. An unprefixed rule restyles the
consumer's page; the reverse has bitten us too.

**Wear the recipe, don't redraw it.** `aparte-btn`, `aparte-field`, `aparte-tag`,
`aparte-checkbox`, `aparte-radio`, `aparte-icon` own shape, spacing, states and focus. A
component adds only what is genuinely its own. In practice:

- Declare the recipe's token (`--aparte-btn-size`, `--aparte-btn-radius`) instead of
  out-specifying the recipe with a more specific selector. A type selector like
  `.some-row button` also hits content mounted inside that row.
- Don't invent a per-component token that resolves to what the recipe already gives —
  it is an alias, not a knob. In light DOM a consumer can always target the class.
- A documented `@cssprop` must be read by some stylesheet. If a component stops drawing
  something itself, feed the recipe from its token rather than leaving the token
  stranded in the JSDoc, where the generated page keeps offering a knob that does
  nothing.

**Icons** live in `packages/core/src/icons/` and carry no size — the container declares
`--aparte-icon-size` (or `--aparte-btn-icon-size` inside a button). A glyph that carries
its own size cannot be shared, which is how the library once ended up with three
different ✕.

**Animations**: one prefixed keyframe per motion, declared in `base.css` next to its
consumers.

## Anti-patterns

- No third-party dependencies in `@aparte/core` (the zero-dep promise; `@aparte/engine` is the one first-party dependency).
- No framework code at the repo root — frameworks live only in their wrapper package (peer + dev)
  and its example.
- No product logic (routing, settings, persistence) in the library.
- No CSS in a `getStyles()` string for anything core itself renders.
- No unprefixed class or keyframe name.
- No bare type selector (`div`, `button`) outside a container that owns its own content —
  prose and code panes qualify; a row that something else can be mounted into does not.
