/**
 * aparté React wrapper
 * React 18/19 integration with hooks and segment support.
 */

export { AparteChat } from './components/AparteChat.js';
export type { AparteChatProps, AparteChatHandle } from './components/AparteChat.js';

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
    AparteSegment,
    AparteTextSegment,
    AparteCodeSegment,
    AparteThinkingSegment,
    AparteTerminalSegment,
} from './types.js';

// Custom-element type declarations for TypeScript/JSX.
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace -- JSX augmentation requires a namespace
    namespace JSX {
        interface IntrinsicElements {
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
        }
    }
}
