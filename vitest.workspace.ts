import { defineWorkspace } from 'vitest/config';

// Each package ships its own vitest.config.ts (environment, setup files, globals).
// Running `vitest` from the root delegates to those per-package configs so their
// setup (e.g. jsdom polyfills) applies — instead of one root glob that skips it.
export default defineWorkspace(['packages/*']);
