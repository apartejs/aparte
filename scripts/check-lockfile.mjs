#!/usr/bin/env node
/**
 * Refuses a `pnpm-lock.yaml` that no longer matches the manifests.
 *
 * Every CI job installs with `--frozen-lockfile`, which fails outright when a
 * manifest and the lockfile disagree — so a stale lockfile does not degrade CI,
 * it stops it at step one, before a single test runs. Nothing in `pnpm gate`
 * saw that: the local install is not frozen, so it silently repairs the drift in
 * memory and every guard downstream reads a healthy tree. Green gate, dead CI.
 *
 * That is not hypothetical. It is how this guard came to exist: `vite-plugin-dts`
 * was removed from the root manifest, the lockfile kept its entry, the gate stayed
 * green through several commits, and all four CI jobs would have died on install.
 *
 * ## Why it reads the lockfile instead of asking pnpm
 *
 * The first version shelled out to `pnpm install --frozen-lockfile --lockfile-only`
 * and read the exit code. It failed about one run in six with a non-zero exit and
 * nothing whatsoever on stdout or stderr — and it turned out the child's output is
 * simply not captured when the guard is invoked through `pnpm run` (the same
 * spawn captures 1899 bytes and the real error from bare node, and through
 * `pnpm exec`). So the wrapper was announcing "your lockfile is stale" from an
 * exit code it had no evidence for: the exact failure mode of the guard it was
 * added to fix. An intermittent red on the gate's FIRST step is worse than no
 * guard, because it teaches everyone to re-run instead of to read.
 *
 * So this does the comparison itself. `importers:` is the only part of the
 * lockfile that mirrors the manifests, its shape is flat and regular, and reading
 * it needs no subprocess, no network and no YAML dependency — which makes the
 * answer deterministic, which was the whole problem.
 *
 * It is deliberately conservative: anything it cannot parse is a failure, not a
 * shrug. A guard that cannot run has not passed.
 *
 * peerDependencies are not compared, because pnpm does not record them under
 * `importers:` — that is why the `workspace:~` peers introduced alongside this
 * guard appear nowhere in the lockfile.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const LOCKFILE = 'pnpm-lock.yaml';
const FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'];

function fail(headline, detail) {
    console.error(`[lockfile] FAIL: ${headline}`);
    console.error('  Every CI job installs with --frozen-lockfile, so this does not slow CI down — it stops it.');
    console.error('  Fix: run `pnpm install` and commit pnpm-lock.yaml. Not `--no-frozen-lockfile`.');
    if (detail) console.error(`\n${detail}`);
    process.exit(1);
}

const unquote = (s) => s.replace(/^['"]|['"]$/g, '');

// ── The lockfile's view ─────────────────────────────────────────────────────
const lines = readFileSync(LOCKFILE, 'utf8').split(/\r?\n/);
const start = lines.findIndex((l) => l === 'importers:');
if (start < 0) fail(`${LOCKFILE} has no \`importers:\` block — the format this guard reads has changed.`);

/** @type {Map<string, Map<string, string>>} dir -> (dep name -> specifier) */
const locked = new Map();
let dir = null;
let section = null;
let dep = null;

for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    if (/^\S/.test(line)) break; // next top-level key ends the block

    let m = /^ {2}(\S.*):$/.exec(line);
    if (m) { dir = unquote(m[1]); locked.set(dir, new Map()); section = null; dep = null; continue; }

    m = /^ {4}([A-Za-z]+):$/.exec(line);
    if (m) { section = m[1]; dep = null; continue; }

    m = /^ {6}(\S.*):$/.exec(line);
    if (m) { dep = unquote(m[1]); continue; }

    m = /^ {8}specifier: (.*)$/.exec(line);
    if (m && dir !== null && dep !== null && FIELDS.includes(section)) {
        locked.get(dir).set(dep, unquote(m[1].trim()));
    }
}

if (locked.size === 0) fail(`parsed zero importers out of ${LOCKFILE} — the format this guard reads has changed.`);

// ── Overrides ───────────────────────────────────────────────────────────────
// A `pnpm.overrides` entry (root package.json) makes pnpm record the OVERRIDDEN
// version as the importer's specifier, not the one the manifest asked for. Five
// packages ask for `@types/node: ^22.0.0` and the lockfile says `20.11.0` — that
// is the override working, not drift. For an overridden name only presence is
// compared; the version is pnpm's to decide.
const overridden = new Set();
{
    const at = lines.findIndex((l) => l === 'overrides:');
    if (at >= 0) {
        for (let i = at + 1; i < lines.length && !/^\S/.test(lines[i]); i++) {
            const m = /^ {2}(\S.*?):\s*\S/.exec(lines[i]);
            if (m) overridden.add(unquote(m[1]));
        }
    }
}

// ── The manifests' view ─────────────────────────────────────────────────────
// Expand the `packages:` globs of pnpm-workspace.yaml. Only the trailing-`*`
// forms this repo uses are supported; anything else is refused rather than
// quietly skipped, since a silently unchecked project is how drift survives.
const wsPatterns = readFileSync('pnpm-workspace.yaml', 'utf8')
    .split(/\r?\n/)
    .map((l) => /^\s*-\s*'?([^'#\s]+)'?/.exec(l)?.[1])
    .filter(Boolean);

function expand(pattern) {
    const parts = pattern.split('/');
    let dirs = [''];
    for (const part of parts) {
        const next = [];
        for (const base of dirs) {
            if (part !== '*') { next.push(base ? `${base}/${part}` : part); continue; }
            if (!existsSync(base || '.')) continue;
            for (const entry of readdirSync(base || '.', { withFileTypes: true })) {
                if (entry.isDirectory() && entry.name !== 'node_modules') {
                    next.push(base ? `${base}/${entry.name}` : entry.name);
                }
            }
        }
        dirs = next;
    }
    return dirs.filter((d) => existsSync(join(d, 'package.json')));
}

for (const p of wsPatterns) {
    if (p.includes('**') || (p.includes('*') && !p.split('/').includes('*'))) {
        fail(`pnpm-workspace.yaml pattern "${p}" is not one this guard knows how to expand.`);
    }
}

const projects = ['.', ...wsPatterns.flatMap(expand)];

// ── Compare ─────────────────────────────────────────────────────────────────
const problems = [];

for (const project of projects) {
    const manifest = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'));
    const expected = new Map();
    for (const field of FIELDS) {
        for (const [name, spec] of Object.entries(manifest[field] ?? {})) expected.set(name, spec);
    }
    const actual = locked.get(project) ?? new Map();

    for (const [name, spec] of expected) {
        if (!actual.has(name)) problems.push(`${project}: "${name}": "${spec}" is in package.json, missing from the lockfile`);
        else if (!overridden.has(name) && actual.get(name) !== spec) problems.push(`${project}: "${name}" is "${spec}" in package.json, "${actual.get(name)}" in the lockfile`);
    }
    for (const name of actual.keys()) {
        if (!expected.has(name)) problems.push(`${project}: "${name}" is in the lockfile, gone from package.json`);
    }
}

for (const lockedDir of locked.keys()) {
    if (!projects.includes(lockedDir)) problems.push(`${lockedDir}: in the lockfile, not a workspace project any more`);
}

if (problems.length) {
    fail(
        `${problems.length} difference(s) between pnpm-lock.yaml and the manifests.`,
        problems.map((p) => `  ${p}`).join('\n'),
    );
}

console.log(
    `[lockfile] OK: ${projects.length} workspace projects, every dependency specifier matches pnpm-lock.yaml.`,
);
