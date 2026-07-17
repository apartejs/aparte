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
]);
