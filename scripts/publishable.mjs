/*
 * Every publishable package in the workspace — `packages/**`, not private, named and
 * versioned — read from the manifests on disk. One list for the three release scripts
 * that need it (`align-dist-tags`, `release-pending`, `tag-release`), so they cannot
 * disagree on what "every package" means.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** @returns {{ name: string, version: string }[]} */
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
                if (pkg.name && !pkg.private && pkg.version) found.push(pkg);
            }
            try { walk(full, depth + 1); } catch { /* not a directory */ }
        }
    };
    walk(join(root, 'packages'), 0);
    return found;
}
