#!/usr/bin/env node
/*
 * check-gate-in-ci — every step of `pnpm gate` runs in a CI workflow.
 *
 * Why this exists, and why it is embarrassing that it did not. `pnpm gate` is the
 * 26-step chain the conventions call the thing to run before a merge; CI lists the
 * steps individually so a failure names the guard instead of a 20-minute chain.
 * Listing them by hand means the two drift, and they did: SEVEN gate steps ran in
 * no workflow at all — `check:lockfile`, `check:dist-freshness`,
 * `check:coverage-floors`, `check:text-escaping`, `check:secure-context`,
 * `check:event-map`, `check:cross-refs`. Five of those are guards that bite.
 *
 * The tell was that the only place those names appeared under `.github/` was a
 * COMMENT narrating a previous audit finding exactly this shape. A lesson written
 * down and not mechanised is a lesson that gets learned again.
 *
 * The check is a set difference, deliberately dumb: a step in the gate chain must
 * appear somewhere in the workflow files. It does not care which job or in what
 * order — only that nothing is silently missing.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOWS = '.github/workflows';

/**
 * Gate steps that deliberately do not run in CI, each with a reason.
 *
 * Keep this empty if you can. An entry here is a promise nobody keeps on a pull
 * request.
 */
const EXEMPT = new Map([
    ['pnpm build', 'the dedicated build job runs it; the gate chain re-runs it locally'],
    ['pnpm lint', 'its own job, run on every push'],
    ['pnpm typecheck', 'its own job'],
    ['pnpm typecheck:tests', 'its own job'],
    ['pnpm typecheck:matrix', 'its own job'],
    ['pnpm check-packaging', 'its own job: publint/attw across 15 packages'],
    ['pnpm check:node-import', 'runs in the Node version matrix, where it means something'],
    ['pnpm test:coverage', 'named in the guards job, and the coverage job'],
]);

const gate = JSON.parse(readFileSync('package.json', 'utf8')).scripts.gate;
const steps = gate.split('&&').map(s => s.trim()).filter(Boolean);

const ci = readdirSync(WORKFLOWS)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map(f => readFileSync(join(WORKFLOWS, f), 'utf8'))
    .join('\n');

/**
 * Only the `run:` lines count. A step named in a comment is exactly the failure
 * mode this guard was written for — the seven missing steps appeared under
 * `.github/` solely inside a comment about them going missing.
 */
const runLines = ci.split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('run:') || l.startsWith('- run:'))
    .join('\n');

const missing = steps.filter(step => !EXEMPT.has(step) && !runLines.includes(step));
const staleExemptions = [...EXEMPT.keys()].filter(step => !steps.includes(step));

if (missing.length || staleExemptions.length) {
    if (missing.length) {
        console.error(`\n[gate-in-ci] ${missing.length} gate step(s) run in no workflow:\n`);
        for (const s of missing) console.error(`  ${s}`);
        console.error(
            '\nAdd them to a job in .github/workflows/, or add them to EXEMPT in this script\n'
            + 'WITH A REASON. A step only in the gate chain is a step no pull request runs.\n',
        );
    }
    if (staleExemptions.length) {
        console.error(
            `[gate-in-ci] ${staleExemptions.length} exemption(s) for steps no longer in the gate:\n`
            + staleExemptions.map(s => `  ${s}`).join('\n')
            + '\n\nRemove them, so the table keeps describing the real chain.\n',
        );
    }
    process.exit(1);
}

console.log(
    `[gate-in-ci] OK: ${steps.length - EXEMPT.size} of ${steps.length} gate steps appear in a `
    + `workflow \`run:\`, ${EXEMPT.size} exempt with a stated reason.`,
);
