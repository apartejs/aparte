/**
 * An element that is nobody's — not core's, not a plugin's — and the spec that describes it, typed
 * into Vue's templates through `AparteVueElement`: the three lines a plugin's consumer writes.
 * `SpecElementTypeChecks.vue` holds templates to it (`typecheck:tests`).
 */
import type { AparteElementSpec } from '@aparte/core';
import type { AparteVueElement } from '../../index.js';

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

declare module 'vue' {
    interface GlobalComponents { 'fx-widget': AparteVueElement<typeof fxWidgetElement> }
}
