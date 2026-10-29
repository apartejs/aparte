#!/usr/bin/env node
/*
 * Refuses a version off the allowed major (see `ALLOWED_MAJOR` in `./publishable.mjs`).
 * `pnpm version-packages` runs it last, so a 1.0.0 nobody asked for stops on the machine
 * that versioned it, before a version PR exists; `release-pending` and `prerelease-checks`
 * refuse it again before any publish.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED_MAJOR, majorRefusal, offMajor, publishable } from './publishable.mjs';

const packages = publishable(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
if (packages.length === 0) {
    console.error('[check-major] no publishable package found under packages/: the walk went blind.');
    process.exit(1);
}
const off = offMajor(packages);
if (off.length) {
    console.error(`[check-major] ${majorRefusal(off)}`);
    process.exit(1);
}
console.log(`[check-major] ${packages.length} package(s), all on ${ALLOWED_MAJOR}.x.`);
