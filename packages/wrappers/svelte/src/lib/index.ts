/**
 * aparté Svelte wrapper — Svelte 4 AND 5, from one shipped source.
 *
 * The package publishes its `.svelte` files rather than a prebuilt bundle, so the
 * consumer's own compiler handles them: no prebuilt artifact can serve both majors.
 * Both are proven in a browser (`apps/examples/svelte4` and `svelte5`).
 */

export { default as AparteChat } from './AparteChat.svelte';

// Idiomatic ergonomics: a store factory that owns the messages store.
export { createAparteChat } from './stores/aparteChat.js';
export type { AparteChatStore } from './stores/aparteChat.js';
// The imperative surface `<AparteChat>` exposes (its `export function`s),
// re-exported straight from `@aparte/core` — the single source of truth. It used
// to be aliased here as `AparteChatInstance` and as `AparteChatHandle` in React:
// one contract wearing three names in a suite that ships all four together.
export type { AparteChatImperativeApi } from '@aparte/core';

// Annex: client lifecycle, reactive conversation manager, universal proxy.
export { createAparteClient } from './stores/aparteClient.js';
export { createConversationManager } from './stores/conversationManager.js';
export { default as AparteUi } from './AparteUi.svelte';
export type { AparteUiProps, AparteUiHandle } from './types.js';

export type {
    AparteMessage,
    AparteSendEventDetail,
    AparteActionEventDetail,
    AparteSegment,
    AparteTextSegment,
    AparteCodeSegment,
    AparteThinkingSegment,
    AparteTerminalSegment
} from './types.js';
