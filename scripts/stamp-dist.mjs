#!/usr/bin/env node
/**
 * The last command of every package's `build`: record the src this dist was built from.
 *
 * Run from the package directory (npm scripts run there). See `dist-freshness.mjs` for why
 * the record is written by the build rather than by the check.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { stampBuild } from './dist-freshness.mjs';

const dir = process.cwd();
if (!existsSync(join(dir, 'src')) || !existsSync(join(dir, 'dist'))) {
    console.error(`[stamp-dist] ${dir} has no src/ and dist/ to stamp — run it at the end of a package build.`);
    process.exit(1);
}
if (!stampBuild(dir)) console.warn(`[stamp-dist] ${dir}: not recorded — no JavaScript in dist/, or src changed while the build ran — so the dist reads as stale until it is rebuilt. A build restored from the nx cache does not record it: rebuild with --skip-nx-cache.`);
