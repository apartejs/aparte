/*
 * Every publishable package in the workspace — `packages/**`, not private, named and
 * versioned — read from the manifests on disk, how two of their versions compare, and the
 * one major they may carry. One source for the release scripts that need them
 * (`align-dist-tags`, `release-pending`, `tag-release`, `check-major`, `prerelease-checks`),
 * so they cannot disagree.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/** @returns {{ name: string, version: string, dir: string }[]} `dir` relative to `root`, with `/`. */
export function publishable(root) {
    const found = [];
    const walk = (dir, depth) => {
        if (depth > 3) return;
        for (const entry of readdirSync(dir)) {
            if (entry === 'node_modules' || entry === 'dist') continue;
            const full = join(dir, entry);
            const manifest = join(full, 'package.json');
            if (existsSync(manifest)) {
                const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
                if (pkg.name && !pkg.private && pkg.version) found.push({ ...pkg, dir: relative(root, full).split('\\').join('/') });
            }
            try { walk(full, depth + 1); } catch { /* not a directory */ }
        }
    };
    walk(join(root, 'packages'), 0);
    return found;
}

function parse(version) {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
    if (!m) throw new Error(`not a version: ${version}`);
    return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? null };
}

/**
 * The major every publishable version carries: 0 until the release that makes v1, which
 * raises it here on purpose, in its own version PR. A `major` changeset would otherwise
 * publish 1.0.0 with nothing to stop it — the version PR merges itself once green — and
 * changesets has proposed 1.0.0 unasked before (up to 0.5.0, a peer range left behind).
 * A version on npm cannot be taken back.
 */
export const ALLOWED_MAJOR = 0;

/** The packages whose version is off {@link ALLOWED_MAJOR}, as `name@version`; empty when none is. */
export function offMajor(packages) {
    return packages.filter((pkg) => parse(pkg.version).core[0] !== ALLOWED_MAJOR).map((pkg) => `${pkg.name}@${pkg.version}`);
}

/** The refusal the three callers print, so they say the same thing. */
export function majorRefusal(off) {
    return `${off.length} package(s) off major ${ALLOWED_MAJOR}: ${off.slice(0, 5).join(', ')}${off.length > 5 ? ', …' : ''}.\n`
        + `    A new major is never published by accident: if this IS the v${ALLOWED_MAJOR + 1} release, raise\n`
        + '    ALLOWED_MAJOR in scripts/publishable.mjs in the same PR; otherwise look for a `major` changeset.';
}

/** Whether version `a` is lower than `b` — `1.0.0-rc.1` < `1.0.0-rc.2` < `1.0.0`. */
export function lower(a, b) {
    const [x, y] = [parse(a), parse(b)];
    for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] < y.core[i];
    if (x.pre === y.pre) return false;
    if (x.pre === null) return false;
    if (y.pre === null) return true;
    return x.pre.localeCompare(y.pre, 'en', { numeric: true }) < 0;
}
