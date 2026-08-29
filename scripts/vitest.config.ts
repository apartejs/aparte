import { defineConfig } from 'vitest/config';

/**
 * The repo's own tooling, tested.
 *
 * `scripts/` is not a package, so none of the workspace's `packages/**` globs reached
 * it and nothing here was ever executed by a test. That was survivable while the guards
 * were assertions about the tree — a broken guard usually fails loudly — but not for the
 * generators: `gen-root-changelog.mjs` walked a hand-kept list of six directory globs,
 * missed `packages/tools` entirely, and the symptom was a package silently absent from
 * the release notes. Nothing about that is loud.
 *
 * Node environment, no DOM: everything here reads the filesystem.
 */
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['__tests__/**/*.test.ts'],
    },
});
