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
// Events come from the DOM map PLUS core's proxy list, because the map omits the five
// detail-less events on purpose and narrowing the tags removed the catch-all that used
// to accept them. See `AparteSvelteHandlers` below.
// ─────────────────────────────────────────────────────────────────────────────
import type { HTMLAttributes } from 'svelte/elements';
import type { AparteElementAttributes, AparteElementTagName, AparteTemplateAttrs, AparteUiEventName } from '@aparte/core';

/**
 * Svelte's `on:` handlers, for every event aparté dispatches.
 *
 * Derived from TWO sources, and it needs both. `HTMLElementEventMap` — which
 * `@aparte/core` augments — carries the events with a detail. It deliberately omits the
 * five that have none (`aparte-cancel`, `aparte-composer-submit`, `aparte-reset-done`,
 * `aparte-select-open`, `aparte-select-close`), because a map entry would type
 * `e.detail` as `null` and gain nothing.
 *
 * That omission was harmless while it only governed `addEventListener`. Declaring the
 * tags here made it a regression: `SvelteHTMLElements` used to end in a catch-all index
 * signature that accepted any `on:` name, and narrowing the tags removed it — so
 * `on:aparte-cancel`, the STOP BUTTON, stopped type-checking. A typed surface that takes
 * a capability away is worse than no typed surface.
 *
 * `AparteUiEventName` closes it: core's proxy list already enumerates every event an
 * element dispatches on itself, those five included, and it is the list `AparteUi`
 * forwards — so the two are the same set by construction. Still no hand-written list
 * here, which is the property that mattered.
 */
type AparteEventName = Extract<keyof HTMLElementEventMap, `aparte-${string}`>;
type AparteAnyEventName = AparteEventName | AparteUiEventName;

/** The typed event for a name, or a detail-free `CustomEvent` when the map has none. */
type AparteEventFor<K extends string> =
    K extends keyof HTMLElementEventMap ? HTMLElementEventMap[K] : CustomEvent<null>;

type AparteSvelteHandlers = {
    [K in AparteAnyEventName as `on:${K}`]?: (event: AparteEventFor<K>) => void;
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
