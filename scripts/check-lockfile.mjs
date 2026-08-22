#!/usr/bin/env node
/**
 * Refuses a `pnpm-lock.yaml` that no longer matches the manifests.
 *
 * Every CI job installs with `--frozen-lockfile`, which fails outright when a
 * manifest and the lockfile disagree — so a stale lockfile does not degrade CI,
 * it stops it at step one, before a single test runs. Nothing in `pnpm gate`
 * saw that: the local install is not frozen, so a dev (or an agent) who edits a
 * `package.json` and never re-installs gets a fully green gate and a CI that
 * cannot start.
 *
 * That is not hypothetical. It is how this guard came to exist: `vite-plugin-dts`
 * was removed from the root manifest, the lockfile kept its entry, the gate stayed
 * green through several commits, and all four CI jobs would have died on install.
 *
 * `--lockfile-only` makes the check cheap (~0.5s) and side-effect free: verified
 * byte-identical lockfile before and after, so running the guard can never dirty
 * the tree it is guarding.
 *
 * The fix is never `--no-frozen-lockfile`, which is what pnpm's own error
 * suggests — that just tells CI to paper over the drift. It is `pnpm install`,
 * then commit the lockfile.
 */
import { spawnSync } from 'node:child_process';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const res = spawnSync(pnpm, ['install', '--frozen-lockfile', '--lockfile-only'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
});

if (res.status === 0) {
    console.log('[lockfile] OK: pnpm-lock.yaml matches every manifest — CI can install.');
    process.exit(0);
}

const detail = `${res.stdout ?? ''}${res.stderr ?? ''}`
    .split('\n')
    .filter((l) => /ERR_PNPM|don't match|Failure reason|not up to date/.test(l))
    .join('\n');

console.error('[lockfile] FAIL: pnpm-lock.yaml is out of date with the manifests.');
console.error('  Every CI job installs with --frozen-lockfile, so this does not slow CI down — it stops it.');
console.error('  Fix: run `pnpm install` and commit pnpm-lock.yaml. Not `--no-frozen-lockfile`.');
if (detail) console.error(`\n${detail}`);
process.exit(1);
