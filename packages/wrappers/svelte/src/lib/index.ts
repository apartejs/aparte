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
    AparteThinkingSegment
} from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Custom-element types for Svelte templates
//
// Types only — nothing here reaches the bundle. `SvelteHTMLElements` from
// `svelte/elements` is what svelte-check consults for a tag's attributes, so
// augmenting it makes `<aparte-select searchable="" />` check, and rejects a typo.
//
// Derived from core's registry for the same reason as the other wrappers: a
// hand-written list is a list that goes stale, which is the defect this whole lot
// existed to remove.
//
// Events stay with the DOM: `@aparte/core` augments `HTMLElementEventMap`, so
// `on:aparte-select-change={e => e.detail.value}` is typed already.
// ─────────────────────────────────────────────────────────────────────────────
import type { HTMLAttributes } from 'svelte/elements';
import type { AparteElementAttributes, AparteElementTagName, AparteTemplateAttrs } from '@aparte/core';

/**
 * Svelte's `on:` handlers, for every event aparté dispatches.
 *
 * Derived from `HTMLElementEventMap`, which `@aparte/core` augments — so this needs no
 * list of its own and cannot fall behind. Declaring the elements without it made the
 * wrapper's OWN component stop type-checking (`on:aparte-send` on `<aparte-composer>`),
 * which is how the gap surfaced.
 */
type AparteEventName = Extract<keyof HTMLElementEventMap, `aparte-${string}`>;

type AparteSvelteHandlers = {
    [K in AparteEventName as `on:${K}`]?: (event: HTMLElementEventMap[K]) => void;
};

type AparteSvelteElements = {
    [K in AparteElementTagName]:
        HTMLAttributes<HTMLElement>
        & AparteTemplateAttrs<AparteElementAttributes[K]>
        & AparteSvelteHandlers;
};

declare module 'svelte/elements' {
    interface SvelteHTMLElements extends AparteSvelteElements {}
}
