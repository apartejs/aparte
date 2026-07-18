/**
 * aparté Angular wrapper
 * Angular 19 standalone components + services over the framework-agnostic web components.
 */

// Configuration (a standalone provider function — no NgModule).
export { provideAparte, APARTE_CONFIG_TOKEN } from './lib/provide-aparte';
export type { ProvideAparteOptions, ApartePluginLoader } from './lib/provide-aparte';

// Components (standalone — import them directly).
export { AparteChatComponent } from './lib/aparte-chat.component';
export { AparteUiComponent } from './lib/aparte-ui.component';
export type { AparteUiHandle } from './lib/aparte-ui.component';

// Annex: client lifecycle + reactive conversation manager.
export { AparteAiService, APARTE_CLIENT_OPTIONS } from './lib/aparte-ai.service';
export { ConversationManagerService } from './lib/conversation-manager.service';

// Public types — re-exported from `@aparte/core`, the single source of truth
// (the component used to re-declare `AparteMessage`/`AparteSendEventDetail` locally).
export type {
    AparteMessage,
    AparteSendEventDetail,
    AparteActionEventDetail,
    AparteSegment,
    AparteTextSegment,
    AparteCodeSegment,
    AparteThinkingSegment,
    AparteTerminalSegment,
} from '@aparte/core';

// Re-export AparteConfig for direct access (config without `provideAparte`).
export { AparteConfig } from '@aparte/core';
