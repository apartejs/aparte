/**
 * The version core ships, read at build time — the same source the landing's nav chip
 * reads (`pages/index.astro`), exposed for MDX pages that print a version in prose or in
 * a code block (the CDN URLs on getting-started). A page that reads it cannot go stale on
 * a bump, which is what a hand-pinned URL did on every release before this.
 */
import pkg from '../../../../packages/core/package.json';

export const CORE_VERSION: string = pkg.version;
