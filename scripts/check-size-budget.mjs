#!/usr/bin/env node
/*
 * The weight each published package ships, held to a budget.
 *
 * Every publishable package's `dist` is measured the way a CDN serves it: each JavaScript and
 * CSS file gzipped at level 9 (source maps and type declarations are not shipped to a browser,
 * so they do not count), summed per package. `apps/docs/src/data/size-budget.json` holds the
 * ceiling of each — beside the site's other measurements, since the performance reference page
 * publishes it. A package over its ceiling fails; so does a package with no ceiling, and a ceiling for a
 * package that no longer exists — a budget nobody reads is not a budget.
 *
 * Raising a ceiling is a decision, made in the pull request that needs it and visible in its
 * diff: rewrite the file with `--write`, which sets every ceiling to the measured size plus the
 * headroom below, and say in the PR why the package grew.
 *
 * Why it exists: the startup weight of a working chat went from 88 KB to 122 KB gzip between
 * 0.19.2 and 0.32.1, one feature at a time, and nothing said so until the comparison page was
 * re-measured by hand. The site's chart measures a whole chat against other libraries, by hand;
 * this measures every package on every gate run.
 *
 * Usage (part of `pnpm gate`, after the build — it reads `dist`):
 *   node scripts/check-size-budget.mjs            check
 *   node scripts/check-size-budget.mjs --write    set the ceilings from the current build
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { publishable } from './publishable.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET = join(root, 'apps/docs/src/data/size-budget.json');
/** What `--write` adds above the measured size: room for a fix, not for a feature. */
const HEADROOM = 0.05;
const KB = 1024;

/** Every file under `dir`, recursively. */
function files(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...files(full));
        else out.push(full);
    }
    return out;
}

/** The gzip size of the JavaScript and the CSS a package ships, in bytes. */
function measure(dir) {
    const dist = join(root, dir, 'dist');
    if (!existsSync(dist)) return null;
    const size = { js: 0, css: 0 };
    for (const file of files(dist)) {
        const kind = file.endsWith('.js') || file.endsWith('.mjs') ? 'js' : file.endsWith('.css') ? 'css' : null;
        if (!kind) continue;
        size[kind] += gzipSync(readFileSync(file), { level: 9 }).length;
    }
    return size;
}

const kb = (bytes) => `${(bytes / KB).toFixed(1)} KB`;
const packages = publishable(root).sort((a, b) => a.name.localeCompare(b.name));
if (packages.length === 0) {
    console.error('[size-budget] no publishable package found under packages/: the walk went blind.');
    process.exit(1);
}

const measured = {};
const unbuilt = [];
for (const pkg of packages) {
    const size = measure(pkg.dir);
    if (size) measured[pkg.name] = size;
    else unbuilt.push(pkg.name);
}
if (unbuilt.length) {
    console.error(`[size-budget] ${unbuilt.length} package(s) have no dist — build first: ${unbuilt.join(', ')}`);
    process.exit(1);
}

if (process.argv.includes('--write')) {
    const ceil = (bytes) => Math.ceil((bytes * (1 + HEADROOM)) / 256) * 256;
    const budget = Object.fromEntries(Object.entries(measured).map(([name, size]) => [name, { js: ceil(size.js), css: ceil(size.css) }]));
    writeFileSync(BUDGET, `${JSON.stringify(budget, null, 4)}\n`);
    console.log(`[size-budget] wrote ${Object.keys(budget).length} ceilings (measured + ${HEADROOM * 100}%) to apps/docs/src/data/size-budget.json.`);
    process.exit(0);
}

const budget = JSON.parse(readFileSync(BUDGET, 'utf8'));
const problems = [];
for (const [name, size] of Object.entries(measured)) {
    const ceiling = budget[name];
    if (!ceiling) {
        problems.push(`${name} has no ceiling: add it with --write and say why in the PR.`);
        continue;
    }
    for (const kind of ['js', 'css']) {
        if (size[kind] > ceiling[kind]) {
            problems.push(`${name} ${kind.toUpperCase()} is ${kb(size[kind])} gzip, over its ${kb(ceiling[kind])} ceiling (+${kb(size[kind] - ceiling[kind])}).`);
        }
    }
}
for (const name of Object.keys(budget)) {
    if (!measured[name]) problems.push(`${name} has a ceiling but is not a published package any more: remove it.`);
}

if (problems.length) {
    console.error(`[size-budget] ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
    console.error('  A ceiling rises on purpose: `node scripts/check-size-budget.mjs --write`, and the PR says why the package grew.');
    process.exit(1);
}
const core = measured['@aparte/core'];
const total = Object.values(measured).reduce((sum, size) => sum + size.js + size.css, 0);
console.log(`[size-budget] OK: ${Object.keys(measured).length} packages within their ceilings; @aparte/core ${kb(core.js)} JS + ${kb(core.css)} CSS gzip, all packages ${kb(total)}.`);
