#!/usr/bin/env node
/*
 * Every publishable package's README is a published artifact: it is the page npm
 * shows, and for most visitors it is the only page they read. This check refuses two
 * kinds of rot in it.
 *
 * 1. **Claims that cannot be true of a published package.** `@aparte/core`'s README
 *    carried "🚧 **Pre-alpha** — not yet published to npm" through four npm releases:
 *    nothing was wrong with the code, the first line a visitor read was simply false,
 *    and no gate looked at it. `publint` and `attw` check a package's *shape*; nobody
 *    was checking its *claims*.
 *
 * 2. **Examples that import symbols the package no longer exports.** Full snippet
 *    typechecking needs a tsconfig per example and is a bigger job; the failure that
 *    actually bites is an import line that cannot resolve after a rename, and that is
 *    mechanical to catch — read the built entry's exports and compare.
 *
 * Same rule as the affordances one (CLAUDE.md #8), applied to prose: do not state what
 * you cannot honour.
 *
 * Usage (part of `pnpm gate`, after check-packaging — it reads `dist`):
 *   node scripts/check-published-readmes.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Phrases a README of a PUBLISHED package cannot truthfully carry. Kept literal and
 * few: this must catch the lie that shipped, not police prose.
 */
const FORBIDDEN = [
    { re: /not yet published/i, why: 'the package is on npm — this is read there' },
    { re: /\bunpublished\b/i, why: 'the package is on npm' },
    { re: /\bpre-?alpha\b/i, why: 'the published channel is alpha, not pre-alpha' },
    { re: /\bcoming soon\b/i, why: 'if it is published, it has arrived' },
    { re: /\bTODO\b/, why: 'a TODO is a note to us, not to a reader on npm' },
];

const IMPORTS = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'(@aparte\/[^']+)'/g;
const EXPORTED =
    /export\s+(?:type\s+)?\{([^}]*)\}|export\s+(?:declare\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;

/** Every package that npm will show a README for. */
function publishable(dir = join(root, 'packages'), depth = 0, out = []) {
    if (depth > 3) return out;
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        const full = join(dir, entry);
        const manifest = join(full, 'package.json');
        if (existsSync(manifest)) {
            const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
            if (pkg.name?.startsWith('@aparte/') && !pkg.private) out.push({ pkg, dir: full });
        }
        try {
            publishable(full, depth + 1, out);
        } catch {
            /* not a directory */
        }
    }
    return out;
}

const packages = publishable();
if (packages.length === 0) {
    console.error('[readme-claims] FAIL: found no publishable package — the walk is wrong.');
    process.exit(1);
}

const byName = new Map(packages.map(({ pkg, dir }) => [pkg.name, { pkg, dir }]));

// The aparte-titler packages (`@aparte/titler*`) are published from their own repository
// and installed by the docs app for /models/titler/. A README that imports one is
// checked against THAT install rather than skipped: an import path nobody verifies is
// the one that rots. Workspace links under the same directory are already in `byName`.
const installed = join(root, 'apps/docs/node_modules/@aparte');
if (existsSync(installed)) {
    for (const entry of readdirSync(installed)) {
        const dir = join(installed, entry);
        const manifest = join(dir, 'package.json');
        if (!existsSync(manifest)) continue;
        const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
        if (pkg.name && !byName.has(pkg.name)) byName.set(pkg.name, { pkg, dir });
    }
}

/** Names a package subpath exports, read from its built `.js` and `.d.ts`. */
function exportsOf(specifier) {
    const parts = specifier.split('/');
    const name = parts.slice(0, 2).join('/');
    const sub = parts.length === 2 ? '.' : `./${parts.slice(2).join('/')}`;
    const found = byName.get(name);
    if (!found) return null;
    const entry = found.pkg.exports?.[sub];
    if (!entry) return null;

    const names = new Set();
    for (const rel of [entry.import ?? entry.default, entry.types]) {
        if (!rel) continue;
        const file = join(found.dir, rel.replace(/^\.\//, ''));
        if (!existsSync(file)) continue;
        for (const m of readFileSync(file, 'utf8').matchAll(EXPORTED)) {
            if (m[1]) {
                for (const part of m[1].split(',')) {
                    const n = part.trim();
                    if (n) names.add(n.split(' as ').pop().trim());
                }
            } else if (m[2]) {
                names.add(m[2]);
            }
        }
    }
    return names;
}

const problems = [];
let symbolsChecked = 0;

for (const { pkg, dir } of packages) {
    const readme = join(dir, 'README.md');
    if (!existsSync(readme)) {
        // `files` lists README.md, so a missing one ships an empty npm page.
        problems.push(`${pkg.name}: no README.md`);
        continue;
    }
    const text = readFileSync(readme, 'utf8');

    for (const { re, why } of FORBIDDEN) {
        const hit = text.match(re);
        if (!hit) continue;
        const line = text.slice(0, hit.index).split('\n').length;
        problems.push(`${pkg.name} README.md:${line} — "${hit[0]}": ${why}`);
    }

    for (const [, block, specifier] of text.matchAll(IMPORTS)) {
        const exported = exportsOf(specifier);
        if (exported === null) {
            problems.push(`${pkg.name} README.md — imports from "${specifier}", which is not an export path`);
            continue;
        }
        for (const part of block.split(',')) {
            const symbol = part.trim().replace(/^type\s+/, '').split(' as ')[0].trim();
            if (!symbol) continue;
            symbolsChecked++;
            if (!exported.has(symbol)) {
                problems.push(`${pkg.name} README.md — "${specifier}" does not export \`${symbol}\` (renamed? removed?)`);
            }
        }
    }
}

if (problems.length) {
    console.error('\n[readme-claims] FAIL: a published README is out of date.\n');
    for (const p of problems) console.error(`  ${p}`);
    console.error('\n  These pages are what npm shows. Fix the README, not the check.\n');
    process.exit(1);
}

console.log(
    `[readme-claims] OK: ${packages.length} published READMEs — no stale claim, ` +
    `${symbolsChecked} imported symbols all exported.`,
);
