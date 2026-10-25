/**
 * `@aparte/svelte/runes` — the Svelte 5 components: runes, snippets, a bindable `messages`,
 * callback props. The entry the next release makes `@aparte/svelte` itself; the Svelte 4
 * components stay at the package root until then, and move to `@aparte/svelte/legacy`.
 */
export { default as AparteChat } from './AparteChat.svelte';
export { default as AparteUi } from './AparteUi.svelte';
export { AparteConversations, createConversations } from './conversations.svelte.js';
export type { AparteUiProps, AparteUiHandle } from '../types.js';
export type { AparteChatProps } from './types.js';
export type { AparteChatImperativeApi } from '@aparte/core';
export { createAparteClient } from '../stores/aparteClient.js';
export type {
    AparteMessage,
    AparteSendEventDetail,
    AparteActionEventDetail,
    AparteSegment,
    AparteTextSegment,
    AparteCodeSegment,
    AparteThinkingSegment,
} from '../types.js';
