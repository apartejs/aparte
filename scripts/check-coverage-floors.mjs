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
 *   • slack over MAX_SLACK → the floor is raised to the measurement minus one. Locally it
 *     is written into vitest.config.ts and the run goes on, saying so, so the gate does
 *     not stop on a ratchet nobody had turned yet; in CI (`CI` set) it fails, because a
 *     raise nobody commits is a raise that never happened.
 *   • measured BELOW the floor → fail, everywhere. Vitest already refuses this, but if
 *     the reporter and the threshold ever disagree, the disagreement is the bug.
 *
 * It refuses a summary older than the last test run: a stale summary would grade
 * today's floors against yesterday's numbers.
 *
 * It reads the config's thresholds as text rather than importing it, because
 * importing a vitest config pulls the whole vitest plugin chain into a gate step
 * that should stay a file read.
 *
 * Run by `pnpm gate`, right after `test:coverage`.
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SUMMARY = 'coverage/coverage-summary.json';
const REPORT = '.vitest-report.json';
const CONFIG = 'vitest.config.ts';
/**
 * How far a floor may sit below its measurement. Three points absorbs the jitter of a
 * v8 run across environments; anything more is a ratchet nobody turned.
 */
export const MAX_SLACK = 3;
const METRICS = ['lines', 'statements', 'functions', 'branches'];

/** Where the global block's floors sit: four bare `metric: N,` lines inside `thresholds:`. */
function globalStart(config) {
    return config.indexOf('thresholds: {');
}

function globalFloors(config) {
    const at = globalStart(config);
    if (at === -1) return null;
    const out = {};
    for (const m of METRICS) {
        const found = new RegExp(`^\\s{8}${m}:\\s*([\\d.]+),`, 'm').exec(config.slice(at));
        if (found) out[m] = parseFloat(found[1]);
    }
    return Object.keys(out).length === METRICS.length ? out : null;
}

/** Per-glob blocks: `'some/glob/**': { lines: N, ... },` */
function globFloors(config) {
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
function measure(summary, prefix) {
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

/** The config with one floor replaced: the global block's line, or the metric inside a glob's object. */
function writeFloor(config, label, metric, value) {
    if (label === 'global') {
        const at = globalStart(config);
        const re = new RegExp(`^(\\s{8}${metric}:\\s*)[\\d.]+,`, 'm');
        return config.slice(0, at) + config.slice(at).replace(re, `$1${value},`);
    }
    const escaped = label.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const re = new RegExp(`('${escaped}':\\s*\\{[^}]*?${metric}:\\s*)[\\d.]+`);
    return config.replace(re, `$1${value}`);
}

/**
 * Grade every floor in `config` against `summary`.
 *
 * Returns the problems (a floor above its measurement, a glob that matched nothing,
 * an unreadable block), the floors to raise with their new value, the config with
 * those raises written in, and one row per threshold for the report.
 */
export function gradeFloors(config, summary) {
    const problems = [];
    const raises = [];
    const rows = [];
    let next = config;

    const compare = (label, floors, measured) => {
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
                const to = Math.floor(measured[m]) - 1;
                raises.push({ label, metric: m, from: floors[m], to, measured: measured[m] });
                next = writeFloor(next, label, m, to);
            }
        }
    };

    const global = globalFloors(config);
    if (!global) {
        problems.push(`could not read the global thresholds out of ${CONFIG}.`);
        return { problems, raises, rows, config: next };
    }
    compare('global', global, measure(summary, ''));
    for (const [glob, floors] of globFloors(config)) compare(glob, floors, measure(summary, glob.replace(/\/\*\*$/, '')));
    return { problems, raises, rows, config: next };
}

function main() {
    if (!existsSync(SUMMARY)) {
        console.error(
            `[coverage-floors] FAIL: ${SUMMARY} is missing. It comes from the \`json-summary\`\n`
            + '  coverage reporter — run `pnpm test:coverage` first, and check that the reporter\n'
            + '  is still listed in vitest.config.ts.',
        );
        process.exit(1);
    }
    // The summary is written at the end of the coverage run, after the JSON report: one
    // older than the report belongs to an earlier run than the last `vitest`.
    if (existsSync(REPORT) && statSync(SUMMARY).mtimeMs + 1000 < statSync(REPORT).mtimeMs) {
        console.error(
            `[coverage-floors] FAIL: ${SUMMARY} is older than the last test run (${REPORT}).\n`
            + '  It would grade the floors against an earlier run. Run `pnpm test:coverage`.',
        );
        process.exit(1);
    }

    const config = readFileSync(CONFIG, 'utf8');
    const { problems, raises, rows, config: raised } = gradeFloors(config, JSON.parse(readFileSync(SUMMARY, 'utf8')));
    const inCi = Boolean(process.env.CI);

    if (raises.length && inCi) {
        for (const r of raises) {
            problems.push(
                `"${r.label}" ${r.metric} floor is ${r.from} but measures ${r.measured.toFixed(2)}% — `
                + `${(r.measured - r.from).toFixed(1)} points of slack.\n`
                + `      Raise it to ${r.to}. A floor this far below the real number cannot\n`
                + '      fail, which is how deleting a whole test suite once stayed green.',
            );
        }
    }
    if (problems.length) {
        console.error(`\n[coverage-floors] ${problems.length} problem(s):\n`);
        for (const p of problems) console.error(`  - ${p}\n`);
        console.error(`Edit the thresholds in ${CONFIG}. Measured values:\n`);
        for (const r of rows) console.error(`  ${r}`);
        console.error('');
        process.exit(1);
    }
    if (raises.length) {
        writeFileSync(CONFIG, raised);
        console.log(`[coverage-floors] raised ${raises.length} floor(s) to their measurement minus one — commit ${CONFIG}:`);
        for (const r of raises) console.log(`  ${r.label} ${r.metric}: ${r.from} -> ${r.to} (measured ${r.measured.toFixed(2)})`);
        return;
    }
    console.log(
        `[coverage-floors] OK: ${rows.length} thresholds, every one within ${MAX_SLACK} points of its measurement.`,
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
