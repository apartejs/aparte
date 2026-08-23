/**
 * `@aparte/plugin-model-selector` — the DOM-free entry, for Node and SSR.
 *
 * Why this file exists: the browser barrel exports `AparteModelSelector`, and that
 * module does `class AparteModelSelector extends HTMLElement` at MODULE SCOPE. So
 * `import '@aparte/plugin-model-selector'` threw
 *
 *     ReferenceError: HTMLElement is not defined
 *
 * in plain Node — and therefore in any Next / Nuxt / SvelteKit / Analog build that
 * evaluates the import on the server. `@aparte/core` builds exactly this kind of
 * entry and has a gate asserting it stays DOM-free; the plugins were outside that
 * gate.
 *
 * This package is a custom element and nothing else, so the DOM-free surface is
 * types only. That is the honest answer rather than a stub class: on the server
 * there is no element to define, and a fake one would let a mistake through to the
 * browser. A consumer importing the element type for a ref keeps working; a
 * consumer importing the class on the server gets a clear error naming THIS package
 * instead of `@aparte/core`.
 */

export type {
    AparteAIProvider,
    AparteAIModel,
    AparteModelConfig,
    AparteModelChangeEventDetail,
} from '@aparte/core';
