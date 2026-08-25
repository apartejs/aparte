/**
 * aparté Vue wrapper
 * Vue 3 integration with Composition API and segment support
 */

import AparteChat from './components/AparteChat.vue';
export { AparteChat };

// Idiomatic ergonomics: a composable that owns the messages ref + component ref.
export { useAparteChat } from './composables/useAparteChat.js';
// The imperative surface `<AparteChat>` exposes via `defineExpose`, re-exported
// straight from `@aparte/core` — the single source of truth. It used to be
// aliased here as `AparteChatInstance` and as `AparteChatHandle` in React: one
// contract wearing three names in a suite that ships all four together.
export type { AparteChatImperativeApi } from '@aparte/core';

// Annex: client lifecycle, reactive conversation manager, universal proxy.
export { useAparteClient } from './composables/useAparteClient.js';
export { useConversationManager } from './composables/useConversationManager.js';
import AparteUi from './components/AparteUi.vue';
export { AparteUi };
export type { AparteUiProps, AparteUiHandle } from './types.js';

export type {
    AparteMessage,
    AparteSendEventDetail,
    AparteActionEventDetail,
    AparteSegment,
    AparteTextSegment,
    AparteCodeSegment,
    AparteThinkingSegment
} from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Custom-element types for Vue templates
//
// Types only — nothing here reaches the bundle. `GlobalComponents` is how Vue's
// template checker (vue-tsc) learns a tag, so declaring it makes `<aparte-select
// :searchable="''">` complete and check like any component, and rejects an attribute
// that does not exist.
//
// Derived from `AparteElementAttributes` in core rather than listed, so an element
// added there is typed here the moment it is added, and one removed stops resolving.
// Listing tags by hand is what left React with nine of eighteen, all typed `any`.
//
// Events are not declared here: `@aparte/core` augments `HTMLElementEventMap`, so
// `@aparte-select-change="e => e.detail.value"` is already typed through the DOM.
// ─────────────────────────────────────────────────────────────────────────────
import type { DefineComponent } from 'vue';
import type { AparteElementAttributes, AparteElementTagName, AparteTemplateAttrs } from '@aparte/core';

type AparteVueElements = {
    [K in AparteElementTagName]: DefineComponent<AparteTemplateAttrs<AparteElementAttributes[K]>>;
};

declare module 'vue' {
    interface GlobalComponents extends AparteVueElements {}
}
