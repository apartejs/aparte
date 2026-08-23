#!/usr/bin/env node
/**
 * A coverage floor that is never raised is not a ratchet, it is a comment.
 *
 * This repo has learned that three times. The global floor sat at 68 while coverage
 * was 75.8, and deleting the largest rendering suite (791 lines, 77 tests) still
 * exited 0. The per-glob floors added to fix that then drifted the same way: the
 * client's branch floor ended up **21 points** below its measurement and the
 * renderers' function floor **14.6** — and the comment above them claimed they were
 * "set from the MEASURED value minus a point", which by then was false.
 *
 * Nothing could catch it, because Vitest prints a glob's real number only when the
 * threshold FAILS. A floor with slack is invisible by construction.
 *
 * So this reads `coverage/coverage-summary.json` and compares every configured
 * threshold against what was actually achieved:
 *
 *   • slack over MAX_SLACK → fail, and say what to raise it to. This is the drift.
 *   • measured BELOW the floor → fail. Vitest already refuses this, but if the
 *     reporter and the threshold ever disagree, the disagreement is the bug.
 *
 * It reads the config's thresholds as text rather than importing it, because
 * importing a vitest config pulls the whole vitest plugin chain into a gate step
 * that should stay a file read.
 *
 * Run by `pnpm gate`, right after `test:coverage`.
 */
import { readFileSync, existsSync } from 'node:fs';

const SUMMARY = 'coverage/coverage-summary.json';
const CONFIG = 'vitest.config.ts';
/**
 * How far a floor may sit below its measurement. Two points absorbs the jitter of a
 * v8 run across environments; anything more is a ratchet nobody turned.
 */
const MAX_SLACK = 3;
const METRICS = ['lines', 'statements', 'functions', 'branches'];

if (!existsSync(SUMMARY)) {
    console.error(
        `[coverage-floors] FAIL: ${SUMMARY} is missing. It comes from the \`json-summary\`\n`
        + '  coverage reporter — run `pnpm test:coverage` first, and check that the reporter\n'
        + '  is still listed in vitest.config.ts.',
    );
    process.exit(1);
}

const summary = JSON.parse(readFileSync(SUMMARY, 'utf8'));
const config = readFileSync(CONFIG, 'utf8');

/** The global block: four bare `metric: N,` lines inside `thresholds:`. */
function globalFloors() {
    const at = config.indexOf('thresholds: {');
    if (at === -1) return null;
    const out = {};
    for (const m of METRICS) {
        const found = new RegExp(`^\\s{8}${m}:\\s*([\\d.]+),`, 'm').exec(config.slice(at));
        if (found) out[m] = parseFloat(found[1]);
    }
    return Object.keys(out).length === METRICS.length ? out : null;
}

/** Per-glob blocks: `'some/glob/**': { lines: N, ... },` */
function globFloors() {
    const out = new Map();
    for (const m of config.matchAll(/'([^']+\*\*)':\s*\{([^}]*)\}/g)) {
        const floors = {};
        for (const metric of METRICS) {
            const found = new RegExp(`${metric}:\\s*([\\d.]+)`).exec(m[2]);
            if (found) floors[metric] = parseFloat(found[1]);
        }
        out.set(m[1], floors);
    }
    return out;
}

/** Aggregate the summary's per-file entries under a glob prefix. */
function measure(prefix) {
    const totals = Object.fromEntries(METRICS.map((m) => [m, { covered: 0, total: 0 }]));
    let files = 0;
    for (const [file, data] of Object.entries(summary)) {
        if (file === 'total') continue;
        const rel = file.split('\\').join('/');
        if (prefix && !rel.includes(prefix)) continue;
        files++;
        for (const m of METRICS) {
            totals[m].covered += data[m]?.covered ?? 0;
            totals[m].total += data[m]?.total ?? 0;
        }
    }
    if (!files) return null;
    return Object.fromEntries(
        METRICS.map((m) => [m, totals[m].total ? (totals[m].covered / totals[m].total) * 100 : 100]),
    );
}

const problems = [];
const rows = [];

function compare(label, floors, measured) {
    if (!measured) {
        problems.push(`"${label}" matched no file in the coverage summary — the glob is stale or the run was partial.`);
        return;
    }
    for (const m of METRICS) {
        if (floors[m] === undefined) continue;
        const slack = measured[m] - floors[m];
        rows.push(`${label} ${m}: floor ${floors[m]}, measured ${measured[m].toFixed(2)} (slack ${slack.toFixed(2)})`);
        if (slack < 0) {
            problems.push(`"${label}" ${m} measured ${measured[m].toFixed(2)}%, BELOW its floor of ${floors[m]}.`);
        } else if (slack > MAX_SLACK) {
            problems.push(
                `"${label}" ${m} floor is ${floors[m]} but measures ${measured[m].toFixed(2)}% — `
                + `${slack.toFixed(1)} points of slack.\n`
                + `      Raise it to ${Math.floor(measured[m]) - 1}. A floor this far below the real number cannot\n`
                + '      fail, which is how deleting a whole test suite once stayed green.',
            );
        }
    }
}

const global = globalFloors();
if (!global) {
    console.error(`[coverage-floors] FAIL: could not read the global thresholds out of ${CONFIG}.`);
    process.exit(1);
}
compare('global', global, measure(''));
for (const [glob, floors] of globFloors()) compare(glob, floors, measure(glob.replace(/\/\*\*$/, '')));

if (problems.length) {
    console.error(`\n[coverage-floors] ${problems.length} problem(s):\n`);
    for (const p of problems) console.error(`  - ${p}\n`);
    console.error(`Edit the thresholds in ${CONFIG}. Measured values:\n`);
    for (const r of rows) console.error(`  ${r}`);
    console.error('');
    process.exit(1);
}

console.log(
    `[coverage-floors] OK: ${rows.length} thresholds, every one within ${MAX_SLACK} points of its measurement.`,
);
