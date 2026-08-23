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
    AparteTerminalSegment,
} from './types.js';

// Custom-element type declarations for TypeScript/JSX.
//
// Declared ONCE here, then merged into both JSX namespaces below: React 18
// resolves intrinsics through the legacy GLOBAL `JSX` namespace, React 19
// dropped it and resolves `React.JSX` instead. The peer range supports both,
// so both augmentations ship — with only one the other major silently loses
// every `aparte-*` element in JSX (TS2339).
interface AparteIntrinsicElements {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    'aparte-chat-viewport': any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    'aparte-chat-bubble': any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    'aparte-chat-status': any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    'aparte-composer': any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    'aparte-composer-attachments': any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    'aparte-composer-add-attachment': any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    'aparte-composer-input': any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    'aparte-composer-send': any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    'aparte-composer-toolbar': any;
}

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
