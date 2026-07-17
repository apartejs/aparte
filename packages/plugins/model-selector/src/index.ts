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
