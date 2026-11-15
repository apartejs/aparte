/**
 * @aparte/plugin-model-selector
 *
 * Model + provider selector for aparté chat interfaces. Importing this module
 * registers the `<aparte-model-selector>` custom element as a side effect.
 */

export { AparteModelSelector } from './aparte-model-selector.js';

// Re-export types for convenience
export type {
    AparteAIProvider,
    AparteAIModel,
    AparteModelConfig,
    AparteModelChangeEventDetail,
} from '@aparte/core';

// The element described for a framework wrapper — `createAparteElement(modelSelectorElement)` in React,
// `AparteVueElement<typeof modelSelectorElement>` and `AparteSvelteElement<typeof modelSelectorElement>` in Vue and
// Svelte. Data only, generated from the manifest: it defines nothing.
export { modelSelectorElement } from './generated/element-specs.js';
