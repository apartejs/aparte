import { defineWorkspace } from 'vitest/config';

// Each package ships its own vitest.config.ts (environment, setup files, globals).
// Glob the config FILES directly (not dirs) so nested packages under
// `packages/providers/*` are picked up WITH their own config. A bare `packages/*`
// dir glob treats `packages/providers` as a single default (node) project and
// silently skips the per-package configs. Add sibling levels (plugins/…) as they land.
export default defineWorkspace([
    'packages/*/vitest.config.ts',
    'packages/providers/*/*/vitest.config.ts',
    'packages/wrappers/*/vitest.config.ts',
    'packages/plugins/*/vitest.config.ts',
    'packages/locales/*/vitest.config.ts',
    // Found the day the first tool package landed: a root `vitest run packages/tools/x`
    // reported "No test files found, exiting with code 0" — a silence that reads as green.
    'packages/tools/*/vitest.config.ts',
    // Not a package: the repo's own tooling. `scripts/` sat outside every glob above, so
    // nothing in it was ever executed by a test — which is how a generator that walked a
    // hand-kept list of directories could drop a whole published package from the
    // release notes with no symptom at all.
    'scripts/vitest.config.ts',
]);
