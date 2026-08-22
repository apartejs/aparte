/**
 * `svelte-package` copies its whole input directory, tests included.
 *
 * The test hosts are `.svelte` files, so they would ship — and one of them would
 * arrive in a consumer's `node_modules` carrying a JSDoc line that names a removed
 * API. Nothing else in the build knows they exist, so they are removed here rather
 * than left to `files` patterns that only npm honours.
 */
import { rmSync, existsSync } from 'node:fs';

const TESTS = 'dist/__tests__';
if (existsSync(TESTS)) {
    rmSync(TESTS, { recursive: true, force: true });
    console.log('[svelte] removed dist/__tests__ from the packaged output');
}
