/**
 * `svelte-package` copies its whole input directory verbatim. Two things in there
 * must not reach a consumer.
 *
 * 1. **The test hosts.** They are `.svelte` files, so they would ship — and one of
 *    them carries a JSDoc line naming a removed API. Nothing else in the build
 *    knows they exist, so they go here rather than being left to `files` patterns
 *    that only npm honours.
 *
 * 2. **`env.d.ts`.** A dev-only ambient file whose contents are
 *    `/// <reference types="vite/client" />` and a GLOBAL
 *    `declare module '*.svelte' { export default SvelteComponent }`. Shipping that
 *    inside `node_modules` means a consumer whose program picks it up loses the
 *    props on EVERY `.svelte` import in their own app, and inherits a dependency on
 *    Vite's types they never asked for. It also pulled its weight for nothing:
 *    verified with a consumer probe against the built `.d.ts` that `AparteChat`
 *    resolves to a real type — not `any` — with the file removed, because the
 *    consumer's own `svelte` types already declare `*.svelte`.
 */
import { rmSync, existsSync } from 'node:fs';

const REMOVE = [
    ['dist/__tests__', 'the test hosts'],
    ['dist/env.d.ts', "the dev-only ambient `declare module '*.svelte'`"],
];

for (const [path, why] of REMOVE) {
    if (!existsSync(path)) continue;
    rmSync(path, { recursive: true, force: true });
    console.log(`[svelte] removed ${path} from the packaged output — ${why}`);
}

/**
 * FORMER KNOWN GAP — closed. `AparteChat.svelte.d.ts` / `AparteUi.svelte.d.ts` are
 * now emitted (see `dist/`), because the "build" script passes `--tsconfig
 * ./tsconfig.dts.json` to `svelte-package`. Nothing in this script changed for it.
 *
 * The real cause, found by toggling each candidate `tsconfig.json` setting alone
 * against a real `svelte-package -i src/lib -o <dir> --tsconfig <probe>` run: this
 * package's real tsconfig.json inherits `noEmitOnError: true` from the repo base,
 * which silently blocks svelte2tsx's `emitDts` step on diagnostics that are
 * EXPECTED noise in its `dts` transform mode (svelte2tsx's own diagnostic filter
 * already excludes those exact codes as non-fatal) — no error, no output file, no
 * message, `svelte-package` just reports success with nothing written. `composite`
 * is NOT a cause in either direction (verified the same way, toggled alone) and is
 * left untouched.
 *
 * `tsconfig.dts.json` relaxes `noEmitOnError` (plus `declarationMap`, for an
 * unrelated broken-sourcemap-path reason documented there) for this one shadow
 * compile; see its own comments for the evidence. Verified with a consumer `tsc
 * --noEmit` importing the built package: a wrong `AparteChat` prop now errors.
 */
