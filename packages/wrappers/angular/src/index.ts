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

// Typed directives, one per element: the real tag in the template with typed Inputs
// and one Output per event. `<aparte-ui>` stays for an element aparté does not define
// — a third-party one, or yours.
export {
    APARTE_ELEMENT_DIRECTIVES,
    AparteChatViewportDirective,
    AparteChatBubbleDirective,
    AparteChatStatusDirective,
    AparteComposerDirective,
    AparteComposerInputDirective,
    AparteComposerActionDirective,
    AparteComposerAddAttachmentDirective,
    AparteComposerAttachmentsDirective,
    AparteComposerSendDirective,
    AparteComposerCancelDirective,
    AparteComposerToolbarDirective,
    AparteSelectDirective,
    AparteOptionDirective,
    AparteOptgroupDirective,
    AparteConversationListDirective,
    AparteProgressSpinnerDirective,
    AparteElicitationDirective,
    AparteModelSelectorDirective,
    AparteAskUserDirective,
} from './lib/element.directives';

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
    // The imperative surface every wrapper exposes. Angular alone used to omit it,
    // while React and the other two each aliased it under a name of their own.
    AparteChatImperativeApi,
} from '@aparte/core';

// Re-export aparteGlobalConfig for direct access (config without `provideAparte`).
export { aparteGlobalConfig } from '@aparte/core';
