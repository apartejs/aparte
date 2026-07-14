/**
 * aparté Vue wrapper
 * Vue 3 integration with Composition API and segment support
 */

import AparteChat from './components/AparteChat.vue';
export { AparteChat };

// Idiomatic ergonomics: a composable that owns the messages ref + component ref.
export { useAparteChat } from './composables/useAparteChat.js';
export type { AparteChatInstance } from './composables/useAparteChat.js';

// Annex: client lifecycle, reactive conversation manager, universal proxy.
export { useAparteClient } from './composables/useAparteClient.js';
export { useConversationManager } from './composables/useConversationManager.js';
import AparteUi from './components/AparteUi.vue';
export { AparteUi };

export type {
    AparteMessage,
    AparteSendEventDetail,
    AparteSegment,
    AparteTextSegment,
    AparteCodeSegment,
    AparteThinkingSegment,
    AparteTerminalSegment
} from './types.js';
