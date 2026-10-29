/*
 * Every publishable package in the workspace — `packages/**`, not private, named and
 * versioned — read from the manifests on disk, and how two of their versions compare.
 * One source for the three release scripts that need them (`align-dist-tags`,
 * `release-pending`, `tag-release`), so they cannot disagree.
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

/** Whether version `a` is lower than `b` — `1.0.0-rc.1` < `1.0.0-rc.2` < `1.0.0`. */
export function lower(a, b) {
    const [x, y] = [parse(a), parse(b)];
    for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] < y.core[i];
    if (x.pre === y.pre) return false;
    if (x.pre === null) return false;
    if (y.pre === null) return true;
    return x.pre.localeCompare(y.pre, 'en', { numeric: true }) < 0;
}
