/*
 * Turns the repo's root CHANGELOG.md into a docs page.
 *
 * "What changed, and when" is one of the first questions a consumer has, and the
 * answer lived only in the repo and on the GitHub Releases page. Here it is on the
 * domain and — the part GitHub can't give — inside the site's Pagefind index, so a
 * search for a prop or a method finds the release that introduced it.
 *
 * The root CHANGELOG stays the single source (itself aggregated from the
 * per-package ones by scripts/gen-root-changelog.mjs). This only adds frontmatter
 * and rewrites the heading levels, so nothing is maintained twice.
 *
 * Output (git-ignored, always regenerated): src/content/docs/changelog.md
 *
 * At the guessable URL — /changelog — because that is what a person (and an AI asked
 * to check it) types. It first shipped under /reference/release-notes/, where the
 * taxonomy said it belonged and where nobody looked; astro.config keeps that path
 * alive as a redirect.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../../CHANGELOG.md');
const OUT = resolve(here, '../src/content/docs/changelog.md');

const raw = readFileSync(SRC, 'utf8');

// Drop the file's own H1 + the "this is generated" preamble: the page gets its
// title from frontmatter, and a reader here doesn't care how the file is built.
const firstVersion = raw.indexOf('\n## ');
const body = firstVersion === -1 ? raw : raw.slice(firstVersion + 1);

// The AUTO-GENERATED marker is not decoration: `check-doc-snippets` keys off it to
// tell a generated page from a hand-written one, because a generated page's fences
// are not examples somebody wrote (TypeDoc prints type signatures, the CEM prints
// attribute tables) and compiling them as programs measures the generator, not the
// docs. Four of the five generated pages announced themselves and this one did not,
// which would have left the guard needing a hardcoded filename instead of a rule.
const page = `---
title: Changelog
description: What shipped in each version of the @aparte/* packages — they are released together, at one version.
---

<!-- AUTO-GENERATED from CHANGELOG.md by apps/docs/scripts/gen-release-notes.mjs — do not edit by hand. Run \`pnpm --filter @aparte-workspace/docs gen:release-notes\` to refresh. -->

Every \`@aparte/*\` package is released **together at one version**, so a single entry
covers the whole suite. Per-package detail lives in each package's own
\`CHANGELOG.md\` on npm; this page is the aggregate, generated from the repo's
[CHANGELOG.md](https://github.com/apartejs/aparte/blob/main/CHANGELOG.md).

${body.trimEnd()}
`;

writeFileSync(OUT, page, 'utf8');
const versions = [...page.matchAll(/^## /gm)].length;
console.log(`[gen-release-notes] ${versions} version(s) → src/content/docs/changelog.md`);
