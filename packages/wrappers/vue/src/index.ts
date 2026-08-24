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
