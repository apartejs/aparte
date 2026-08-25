/**
 * aparté React wrapper
 * React 18/19 integration with hooks and segment support.
 */

export { AparteChat } from './components/AparteChat.js';
export type { AparteChatProps } from './components/AparteChat.js';
// The imperative surface, re-exported straight from `@aparte/core` — the single
// source of truth. This wrapper used to alias it as `AparteChatHandle`, Vue and
// Svelte as `AparteChatInstance`, and Angular exposed no name at all: one
// contract wearing three names in a suite that ships all four together.
export type { AparteChatImperativeApi } from '@aparte/core';

// Idiomatic ergonomics: a hook that owns the messages state + component ref.
export { useAparteChat } from './hooks/useAparteChat.js';
export type { UseAparteChat } from './hooks/useAparteChat.js';

// Annex: client lifecycle, reactive conversation manager, universal proxy.
export { useAparteClient } from './hooks/useAparteClient.js';
export type { UseAparteClient } from './hooks/useAparteClient.js';
export { useConversationManager } from './hooks/useConversationManager.js';
export type { UseConversationManager } from './hooks/useConversationManager.js';
export { AparteUi } from './components/AparteUi.js';
export type { AparteUiProps, AparteUiHandle } from './components/AparteUi.js';

export type {
    AparteMessage,
    AparteSendEventDetail,
    AparteActionEventDetail,
    AparteSegment,
    AparteTextSegment,
    AparteCodeSegment,
    AparteThinkingSegment,
} from './types.js';

// The attribute facts, from the single source of truth.
import type { AparteElementAttributes, AparteElementTagName, AparteTemplateAttrs } from '@aparte/core';
// Type-only: `AparteTagProps` builds on React's own HTML prop shape, and this file
// had no React import because nothing in it referenced a React type before.
import type * as React from 'react';

// Custom-element type declarations for TypeScript/JSX.
//
// Declared ONCE here, then merged into both JSX namespaces below: React 18
// resolves intrinsics through the legacy GLOBAL `JSX` namespace, React 19
// dropped it and resolves `React.JSX` instead. The peer range supports both,
// so both augmentations ship — with only one the other major silently loses
// every `aparte-*` element in JSX (TS2339).
//
// These were nine entries typed `any`, each with its own eslint-disable. The tags
// were recognised and nothing about them was checked: a typo in an attribute name, a
// number where a string belongs, an attribute that does not exist — all accepted. The
// attribute facts now come from core's registry, so this file describes React's
// IDIOM and nothing else.

/**
 * One attribute, as React must write it.
 *
 * A presence attribute becomes `'' | undefined`, not `boolean`, and that is not
 * pedantry: React stringifies what it sets on a custom element, so `disabled={false}`
 * would render `disabled="false"` — and an element that tests `hasAttribute` reads
 * that as ON. The wrapper's own bubble rendering already uses this idiom
 * (`streaming={isAwaitingReply(m) ? '' : undefined}`); the type now enforces it.
 *
 * A numeric attribute accepts a number or the string it will become, because both
 * read naturally in JSX.
 */
/**
 * An aparté tag in JSX: the standard HTML props, plus the element's own attributes.
 *
 * `Omit` puts the ELEMENT's contract first where the two collide, and one collision is
 * real: `<aparte-chat-bubble role="assistant">` is the message role, while React types
 * `role` as an `AriaRole` union. Intersecting them would leave no assignable value at
 * all, so the element wins and ARIA's narrower type steps aside.
 */
type AparteTagProps<T> =
    Omit<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>, keyof T>
    & AparteTemplateAttrs<T>;

/**
 * Derived from `AparteElementAttributes` rather than listed, so the set cannot drift:
 * an element added to core is typed here the moment it is added to that registry, and
 * one removed from it stops being valid JSX. Listing them by hand is what let nine of
 * eighteen be the whole story.
 *
 * Events are not here on purpose. React has no prop form for a custom event, so a
 * consumer reaches them by ref — and `HTMLElementEventMap` is already augmented by
 * `@aparte/core`, so `el.addEventListener('aparte-select-change', e => e.detail.value)`
 * is typed with nothing further from this package.
 */
type AparteIntrinsicElements = {
    [K in AparteElementTagName]: AparteTagProps<AparteElementAttributes[K]>;
};

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace -- JSX augmentation requires a namespace
    namespace JSX {
        interface IntrinsicElements extends AparteIntrinsicElements {}
    }
}

declare module 'react' {
    // eslint-disable-next-line @typescript-eslint/no-namespace -- React 19 resolves React.JSX
    namespace JSX {
        interface IntrinsicElements extends AparteIntrinsicElements {}
    }
}
