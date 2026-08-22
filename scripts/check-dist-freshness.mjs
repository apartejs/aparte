/**
 * A published `dist` must not be older than the `src` it was built from.
 *
 * This exists because it happened, and cost a full red browser suite. `pnpm gate`
 * reported green — including four guards that READ the built output
 * (`check-export-mentions`, `check-node-barrel-types`, `check-bundle-entries`,
 * `check-node-import`) — while `packages/core/dist/index.js` was nine minutes older
 * than `packages/core/src/utils/uuid.ts`. So the barrel guards were happily
 * validating an artifact that predated the export they were meant to check, and the
 * only thing that noticed was `pnpm e2e`: the Svelte playground resolves core from
 * `dist`, so all 42 of its tests died on
 *
 *     The requested module '.../core/dist/index.js' does not provide an export
 *     named 'uuid'
 *
 * Why `pnpm build` did not refresh it is an nx cache question (`targetDefaults.build`
 * uses the `production` named input, which is `{projectRoot}/**\/*` minus tests — so
 * a project's own `dist` is part of its own inputs). Rather than reverse-engineer the
 * hashing, this asserts the property that actually matters, deterministically.
 *
 * Run by `pnpm gate`, AFTER the build.
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__', '.svelte-kit']);

function newestMtime(dir, newest = 0) {
    for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const path = join(dir, name);
        const st = statSync(path);
        if (st.isDirectory()) newest = newestMtime(path, newest);
        else if (/\.(ts|tsx|css|svelte|vue|json)$/.test(name) && !/\.test\.ts$/.test(name)) {
            newest = Math.max(newest, st.mtimeMs);
        }
    }
    return newest;
}

/** Every published package: has a package.json, a src/ and a dist/. */
function* packages(root) {
    for (const name of readdirSync(root)) {
        if (SKIP_DIRS.has(name)) continue;
        const dir = join(root, name);
        if (!statSync(dir).isDirectory()) continue;
        if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'src'))) yield dir;
        else yield* packages(dir);
    }
}

const stale = [];
let checked = 0;

for (const dir of packages('packages')) {
    const dist = join(dir, 'dist');
    if (!existsSync(dist)) continue;   // never built here; the build step covers that
    checked++;
    const srcNewest = newestMtime(join(dir, 'src'));
    const distNewest = newestMtime(dist) || statSync(dist).mtimeMs;
    if (srcNewest > distNewest) {
        const skew = Math.round((srcNewest - distNewest) / 1000);
        stale.push(`${relative(process.cwd(), dir).split(sep).join('/')}  src is ${skew}s newer than dist`);
    }
}

if (stale.length) {
    console.error(`\n[dist-freshness] ${stale.length} package(s) have a stale dist:\n`);
    for (const s of stale) console.error('  ' + s);
    console.error(
        '\nThe guards that read built output would be validating the OLD artifact, and a'
        + '\nplayground resolving the package from `dist` will fail at runtime on anything'
        + '\nadded since. Rebuild with `npx nx run <project>:build --skip-nx-cache`.\n',
    );
    process.exit(1);
}

console.log(`[dist-freshness] OK: ${checked} built packages, every dist newer than its src.`);
