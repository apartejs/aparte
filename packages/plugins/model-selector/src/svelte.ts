/**
 * `<aparte-model-selector>` typed for Svelte markup. Import once, anywhere:
 *
 * ```ts
 * import '@aparte/plugin-model-selector/svelte';
 * ```
 *
 * A subpath rather than the main entry, and in the plugin rather than in
 * `@aparte/svelte`: see `./react.ts` for both arguments.
 *
 * The `on:` handlers are derived from `HTMLElementEventMap`, which `@aparte/core`
 * augments with every aparté event including this element's `aparte-model-change` — so
 * there is no event list here either.
 */
import type { HTMLAttributes } from 'svelte/elements';
import type { AparteTemplateAttrs } from '@aparte/core';
import type { AparteElementAttributes, AparteElementTagName } from './generated/element-attributes.js';

type AparteEventName = Extract<keyof HTMLElementEventMap, `aparte-${string}`>;

type PluginHandlers = {
    [K in AparteEventName as `on:${K}`]?: (event: HTMLElementEventMap[K]) => void;
};

type PluginElements = {
    [K in AparteElementTagName]:
        HTMLAttributes<HTMLElement> & AparteTemplateAttrs<AparteElementAttributes[K]> & PluginHandlers;
};

declare module 'svelte/elements' {
    interface SvelteHTMLElements extends PluginElements {}
}

export {};
