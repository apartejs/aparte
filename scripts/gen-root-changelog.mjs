/*
 * Generates the ROOT CHANGELOG.md — the human entry point for a release.
 *
 * Every `@aparte/*` package is versioned in lockstep (`fixed` in
 * .changeset/config.json), so a release moves all of them at once and most of their
 * per-package changelogs end up saying nothing but "Updated dependencies".
 * That is the cost of the lockstep, and this file is what pays it back: one
 * section per version, grouped by package, with the dependency-bump noise dropped
 * and the packages that only moved for the ride reduced to a footnote.
 *
 * (This header used to say "all fifteen … thirteen of". It was written when there were
 * fifteen; a count in prose beside a list that grows is a count that will be wrong, and
 * the same drift is what the corpus below was built to survive.)
 *
 * Source of truth stays the per-package CHANGELOG.md files (npm reads those, and
 * changesets owns them). This script only aggregates the entries of the CURRENT
 * version and prepends them to the root file, once, idempotently.
 *
 * Commit hashes are turned into links here rather than by
 * `@changesets/changelog-github`: that generator needs a GitHub token at
 * `changeset version` time, which would make the local versioning path fail.
 * Linkifying a hash needs no token and no network.
 *
 * Run: `node scripts/gen-root-changelog.mjs` — wired into `pnpm version-packages`,
 * so the "Version Packages" PR already carries the root section.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const OUT = join(root, 'CHANGELOG.md');
const REPO_URL = 'https://github.com/apartejs/aparte';

/**
 * Reading order, as PREFIXES — not as the corpus.
 *
 * This used to be the corpus: a hand-kept list of six globs, each walked exactly one
 * level deep. `packages/tools` was not on it, so `@aparte/docs-mcp` — published like
 * every other package — contributed nothing to the root changelog, and its own
 * announcement changeset would have vanished from the 0.16.0 release notes entirely.
 * A directory family that has to be added by hand is a directory family somebody will
 * forget, and the failure is silent by construction: a missing package looks exactly
 * like a package with nothing to say.
 *
 * So the corpus is now a walk (`packageDirs()` below) and this array only decides what
 * a reader sees first. Anything the walk finds that matches no prefix sorts last,
 * alphabetically — it appears, badly ordered, rather than disappearing.
 */
const ORDER = [
    'packages/core',
    'packages/engine',
    'packages/providers',
    'packages/plugins',
    'packages/wrappers',
    'packages/locales',
    'packages/tools',
];

/**
 * Below this many publishable packages, the walk has broken and this script is about to
 * write a changelog that quietly omits most of the release. 20 the day this was written.
 */
const PACKAGE_FLOOR = 20;

/**
 * Every directory under `packages/` holding a non-private package.json, in reading
 * order. Same walk shape as `scripts/check-peer-ranges.mjs`, for the same reason.
 */
function packageDirs() {
    const dirs = [];
    const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'src') continue;
            const child = join(dir, entry.name);
            const manifest = join(child, 'package.json');
            if (existsSync(manifest)) {
                const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
                if (!pkg.private) dirs.push(child);
            }
            walk(child);
        }
    };
    const base = join(root, 'packages');
    if (existsSync(base)) walk(base);

    // Compared as PATHS (`join` + `sep`) rather than as normalised strings: this runs on
    // Windows too, where a hand-written forward slash matches nothing.
    const rank = (dir) => {
        const i = ORDER.findIndex((prefix) => {
            const abs = join(root, prefix);
            return dir === abs || dir.startsWith(abs + sep);
        });
        return i === -1 ? ORDER.length : i;
    };
    return dirs.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * The top version section of a package's CHANGELOG, when it matches `version`.
 * Returns the raw body (everything between the `## <version>` heading and the
 * next `## `), or null when this package has no entry for that version.
 */
function sectionFor(changelog, version) {
    const lines = changelog.split(/\r?\n/);
    const start = lines.findIndex((l) => l.trim() === `## ${version}`);
    if (start === -1) return null;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i].startsWith('## ')) { end = i; break; }
    }
    return lines.slice(start + 1, end).join('\n').trim();
}

/**
 * Split a version body into `{ 'Major Changes': [entry, …], … }`, dropping the
 * `Updated dependencies` bullets and the internal-bump line that follows them.
 * Entries keep their multi-line continuation exactly as changesets wrote it.
 */
function parseSection(body) {
    const buckets = new Map();
    let bucket = null;
    let entry = null;

    const flush = () => {
        if (bucket && entry) {
            const text = entry.join('\n').trimEnd();
            if (text) (buckets.get(bucket) ?? buckets.set(bucket, []).get(bucket)).push(text);
        }
        entry = null;
    };

    for (const line of body.split(/\r?\n/)) {
        const heading = line.match(/^###\s+(.*)$/);
        if (heading) {
            flush();
            bucket = heading[1].trim();
            if (!buckets.has(bucket)) buckets.set(bucket, []);
            continue;
        }
        if (/^-\s/.test(line)) {
            flush();
            // Dependency bumps: the bullet AND the indented package line under it.
            if (/^-\s+Updated dependencies/.test(line)) { entry = null; continue; }
            entry = [line];
            continue;
        }
        // An indented `- @aparte/x@1.2.3` is an internal bump, never entry text — and
        // it is NOT always under an "Updated dependencies" bullet: when a package has
        // changes of its own in the same section, changesets hangs the bump line under
        // the last entry (0.15.0, core: `- @aparte/engine@0.15.0` under the tool-output
        // fix), and the root file — the GitHub Release body — showed it as a stray
        // sub-bullet. Skip it whether or not an entry is open.
        if (/^\s+-\s+@aparte\/[\w-]+@\d/.test(line)) continue;
        if (entry) entry.push(line);
    }
    flush();

    for (const [name, entries] of buckets) if (entries.length === 0) buckets.delete(name);
    return buckets;
}

/** `- d4c448b: text` → `- [d4c448b](…/commit/d4c448b): text` (idempotent). */
function linkifyHashes(text) {
    return text.replace(/^(-\s+)([0-9a-f]{7,40})(:\s)/gm, (_m, dash, hash, colon) =>
        `${dash}[${hash}](${REPO_URL}/commit/${hash})${colon}`);
}

/** Descending semver-ish compare, prerelease aware (`0.3.0-alpha.1` > `0.3.0-alpha.0`). */
function compareVersionsDesc(a, b) {
    const parse = (v) => {
        const [core, pre = ''] = v.split('-');
        const nums = core.split('.').map(Number);
        const preNums = (pre.match(/\d+/g) ?? []).map(Number);
        return { nums, pre, preNums };
    };
    const pa = parse(a), pb = parse(b);
    for (let i = 0; i < 3; i++) {
        const d = (pb.nums[i] ?? 0) - (pa.nums[i] ?? 0);
        if (d !== 0) return d;
    }
    // A release outranks its own prereleases.
    if (!pa.pre && pb.pre) return -1;
    if (pa.pre && !pb.pre) return 1;
    for (let i = 0; i < Math.max(pa.preNums.length, pb.preNums.length); i++) {
        const d = (pb.preNums[i] ?? 0) - (pa.preNums[i] ?? 0);
        if (d !== 0) return d;
    }
    return pb.pre.localeCompare(pa.pre);
}

/** Every `## x.y.z` heading present in a changelog. */
function versionsIn(changelog) {
    return [...changelog.matchAll(/^##\s+(\d+\.\d+\.\d+[^\s]*)\s*$/gm)].map((m) => m[1]);
}

/**
 * The aggregate section for one version: `{ text, changed, bumpedOnly }` where the
 * last two are package-name lists (for the caller's summary line), or null when no
 * package released that version.
 *
 * ## Grouped by CHANGE, not by package — and why that is not a style choice
 *
 * A changeset names every package it touches, and `changeset version` copies its
 * prose into each of those packages' changelogs verbatim. So one entry about the
 * wrappers' slot parity is written four times, and one about a core behaviour that
 * the wrappers re-export is written fifteen. Grouping the aggregate by package
 * therefore multiplies its own body by the size of the lockstep group.
 *
 * 0.8.0 is where that stopped being merely verbose: the section came out at
 * **416 KB**, and the release-notes workflow died on `HTTP 422 — body is too long
 * (maximum is 125000 characters)`. The breakdown was unambiguous — four packages
 * carried the same 30 531 bytes, three the same 19 685, two the same 24 717.
 * Fourteen of the fifteen headings were a copy.
 *
 * So an entry is emitted once, keyed on its text, and the packages that share it are
 * named under it. A reader loses nothing (the per-package `CHANGELOG.md` files are
 * the source of truth and npm shows those); the aggregate stops being fifteen
 * near-identical documents concatenated.
 */
function buildSection(version, packages) {
    const changed = [];
    const bumpedOnly = [];

    for (const { name, changelog } of packages) {
        const body = sectionFor(changelog, version);
        if (body === null) continue;
        const buckets = parseSection(body);
        if (buckets.size === 0) { bumpedOnly.push(name); continue; }
        changed.push({ name, buckets });
    }
    if (changed.length === 0 && bumpedOnly.length === 0) return null;
    const names = { changed: changed.map((c) => c.name), bumpedOnly };

    /*
     * `bucket → entry text → [package, …]`, in first-seen order.
     *
     * The insertion order follows PACKAGE_GLOBS, so core's changes lead and a
     * wrapper-only entry lands after them — the reading order the per-package
     * layout used to give for free.
     */
    const byBucket = new Map();
    for (const { name, buckets } of changed) {
        for (const [bucket, entries] of buckets) {
            const seen = byBucket.get(bucket) ?? byBucket.set(bucket, new Map()).get(bucket);
            for (const entry of entries) {
                (seen.get(entry) ?? seen.set(entry, []).get(entry)).push(name);
            }
        }
    }

    const out = [`## ${version}`, ''];
    out.push('Every `@aparte/*` package ships at this version (they are released in lockstep).', '');

    // Order matters for a reader: Major before Minor before Patch.
    const ORDER = ['Major Changes', 'Minor Changes', 'Patch Changes'];
    const bucketNames = [...byBucket.keys()].sort((a, b) => {
        const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
        return (ia === -1 ? ORDER.length : ia) - (ib === -1 ? ORDER.length : ib);
    });

    const released = names.changed.length + bumpedOnly.length;
    for (const bucket of bucketNames) {
        out.push(`### ${bucket}`, '');
        for (const [entry, owners] of byBucket.get(bucket)) {
            out.push(linkifyHashes(entry));
            // Indented so it stays inside the bullet. "every package" rather than a
            // list of fifteen names, which is the whole point of the lockstep.
            const who = owners.length === released && released > 1
                ? 'every package'
                : owners.map((n) => `\`${n}\``).join(', ');
            out.push(`  <sub>${who}</sub>`, '');
        }
    }

    if (bumpedOnly.length > 0) {
        out.push(
            `<sub>Version-only bumps (no changes of their own): ${bumpedOnly.map((n) => `\`${n}\``).join(', ')}.</sub>`,
            '',
        );
    }
    return { text: out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n', ...names };
}

const corePkg = JSON.parse(readFileSync(join(root, 'packages/core/package.json'), 'utf8'));
const version = corePkg.version;

/** Published packages with a changelog, in reading order. */
const dirs = packageDirs();
if (dirs.length < PACKAGE_FLOOR) {
    console.error(
        `[gen-root-changelog] found only ${dirs.length} publishable package(s) under packages/, `
        + `floor is ${PACKAGE_FLOOR}. The walk broke, and writing the changelog now would drop `
        + 'most of the release from the notes without saying so.',
    );
    process.exit(1);
}
// `--list-packages` prints the corpus, one package name per line, and exits. It is what
// makes the walk testable from outside (`scripts/__tests__/gen-root-changelog.test.ts`
// diffs it against its own walk) and what a human runs when a package is missing from
// the notes: the answer is either "it is not in this list" or "it has nothing to say",
// and those two used to be indistinguishable.
if (process.argv.includes('--list-packages')) {
    for (const dir of dirs) {
        process.stdout.write(`${JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name}
`);
    }
    process.exit(0);
}

const packages = [];
for (const dir of dirs) {
    // `private` is already filtered by the walk; a package with no CHANGELOG.md has
    // simply never been released.
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const changelogPath = join(dir, 'CHANGELOG.md');
    if (!existsSync(changelogPath)) continue;
    packages.push({ name: pkg.name, changelog: readFileSync(changelogPath, 'utf8') });
}

// `--section <version>` prints one released section to stdout, from the root file
// (what we actually published) — used by the release-notes workflow as the body of
// the GitHub Release. Nothing is written in this mode.
const sectionFlag = process.argv.indexOf('--section');
if (sectionFlag !== -1) {
    const wanted = process.argv[sectionFlag + 1];
    if (!wanted) { console.error('[gen-root-changelog] --section needs a version'); process.exit(1); }
    if (!existsSync(OUT)) { console.error(`[gen-root-changelog] no ${OUT}`); process.exit(1); }
    const file = readFileSync(OUT, 'utf8');
    const start = file.indexOf(`\n## ${wanted}\n`);
    if (start === -1) { console.error(`[gen-root-changelog] no section for ${wanted}`); process.exit(1); }
    let end = file.indexOf('\n## ', start + 1);
    if (end === -1) end = file.length;
    // Drop the `## <version>` heading itself: the Release already carries the tag
    // name as its title.
    const lines = file.slice(start + 1, end).split('\n');
    process.stdout.write(`${lines.slice(1).join('\n').trim()}\n`);
    process.exit(0);
}

// `--all` rebuilds the whole file from the per-package changelogs (seeding it, or
// recovering it): the per-package files are the source of truth, this is derived.
const rebuildAll = process.argv.includes('--all');

const section = buildSection(version, packages);
if (!rebuildAll && section === null) {
    console.error(`[gen-root-changelog] no package has a "## ${version}" section — nothing to do.`);
    process.exit(0);
}

const HEADER = [
    '# aparté — release notes',
    '',
    'Every `@aparte/*` package is released together at one version. Per-package detail',
    'lives in each package\'s own `CHANGELOG.md`; this file is the aggregate, generated',
    'by `scripts/gen-root-changelog.mjs` (run as part of `pnpm version-packages`).',
    '',
    '',
].join('\n');

if (rebuildAll) {
    const all = [...new Set(packages.flatMap((p) => versionsIn(p.changelog)))].sort(compareVersionsDesc);
    const sections = all.map((v) => buildSection(v, packages)).filter(Boolean).map((s) => s.text);
    writeFileSync(OUT, `${HEADER}${sections.join('\n')}`.trimEnd() + '\n', 'utf8');
    console.log(`[gen-root-changelog] rebuilt ${sections.length} version(s) → CHANGELOG.md`);
    process.exit(0);
}

const previous = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
const body = previous.startsWith('# ') ? previous.slice(previous.indexOf('\n## ') + 1) : previous;

if (body.startsWith(`## ${version}\n`) || body.includes(`\n## ${version}\n`)) {
    // Already generated for this version: replace that section in place so a
    // re-run (or a second `version` pass) can't duplicate it.
    const start = body.indexOf(`## ${version}\n`);
    let end = body.indexOf('\n## ', start + 1);
    if (end === -1) end = body.length; else end += 1;
    const merged = `${HEADER}${body.slice(0, start)}${section.text}\n${body.slice(end)}`.trimEnd() + '\n';
    writeFileSync(OUT, merged, 'utf8');
    console.log(`[gen-root-changelog] refreshed the ${version} section → CHANGELOG.md`);
} else {
    const merged = `${HEADER}${section.text}${body ? `\n${body.trimStart()}` : ''}`.trimEnd() + '\n';
    writeFileSync(OUT, merged, 'utf8');
    console.log(
        `[gen-root-changelog] wrote ${version}: ${section.changed.length} package(s) with changes, `
        + `${section.bumpedOnly.length} version-only → CHANGELOG.md`,
    );
}
