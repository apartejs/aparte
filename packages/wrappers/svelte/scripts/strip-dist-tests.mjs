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
 * KNOWN GAP, with its cause now established rather than guessed at.
 *
 * No per-component `AparteChat.svelte.d.ts` is emitted, so a consumer's
 * `svelte-check` does not see the component's props: they are documented, not
 * compiler-enforced. `svelte-package` is run with `--types` (its default), and it
 * silently emits nothing.
 *
 * The reason, found by calling the underlying API directly: `svelte2tsx`'s
 * `emitDts` — which is what `svelte-package --types` uses — resolves its tsconfig
 * to a path derived from `libRoot` and throws TS5083 ("Cannot read file
 * 'src/lib/tsconfig.json'") when none is there. `svelte-package` swallows that
 * error and reports success. Putting a tsconfig in `src/lib` does not fix it — the
 * path arithmetic then looks for `src/lib/src/lib/tsconfig.json`, and the stray
 * config gets copied into the output.
 *
 * So this is upstream, not ours, and the honest state is: documented props, no
 * ambient module hijack, and this note so the next attempt starts from the cause.
 */
