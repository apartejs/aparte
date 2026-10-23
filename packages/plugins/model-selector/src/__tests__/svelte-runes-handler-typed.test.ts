/**
 * The plugin's Svelte binding types the runes form of its event, like core's tags do.
 *
 * `@aparte/svelte` typed `onaparte-*` attributes on core's tags; this subpath declares
 * `<aparte-model-selector>` itself and mapped `on:` only, so `onaparte-model-change={…}` failed
 * svelte-check. The assertion is the TYPE: `pnpm typecheck:tests` compiles this file, and the
 * handler below did not compile before.
 */
import { it, expect } from 'vitest';
import type { SvelteHTMLElements } from 'svelte/elements';
import type {} from '../svelte.js';

type RunesHandler = NonNullable<SvelteHTMLElements['aparte-model-selector']['onaparte-model-change']>;

it('takes onaparte-model-change, with the detail typed', () => {
    const handler: RunesHandler = (e) => { void e.detail.modelId; };
    expect(typeof handler).toBe('function');
});
