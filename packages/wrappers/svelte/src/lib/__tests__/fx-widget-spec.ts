/**
 * An element that is nobody's — not core's, not a plugin's — and the spec that describes it, typed
 * into Svelte's templates through `AparteSvelteElement`: the three lines a plugin's consumer writes.
 * `SpecElementHost.svelte` holds a template to it (`typecheck:tests`).
 */
import type { AparteElementSpec } from '@aparte/core';
import type { AparteSvelteElement } from '../index.js';

export const fxWidgetElement: AparteElementSpec<
    { label?: string; compact?: boolean },
    { items?: string[] },
    { 'fx-widget-pick': { name: 'pick'; detail: { value: string } } }
> = {
    tag: 'fx-widget',
    attributes: ['label', 'compact'],
    properties: ['items'],
    events: [['fx-widget-pick', 'pick']],
    initial: [],
};

declare module 'svelte/elements' {
    interface SvelteHTMLElements { 'fx-widget': AparteSvelteElement<typeof fxWidgetElement> }
}
