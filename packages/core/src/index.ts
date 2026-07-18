/**
 * Aparte
 * High-performance AI conversation engine in Vanilla TypeScript
 * Zero-dependency Web Components for LLM streaming
 * 
 * @packageDocumentation
 */
import './styles/aparte.css';
import './primitives/select/select.css';
import './primitives/progress-spinner/progress-spinner.css';

// Global HTMLElementEventMap augmentation — typed `e.detail` for aparté events.
import './types/event-map.js';

// Export primitives
export { AparteSelect, AparteOption, AparteOptgroup, type AparteSelectChangeDetail, AparteProgressSpinner } from './primitives/index.js';

// Export types
export type {
    AparteBubbleRole,
    AparteMessage,
    AparteContentParser,
    AparteSendEventDetail,
    AparteTokenEventDetail,
    AparteViewportConfig,
    AparteInputConfig,
    AparteThemeVariables,
    AparteStatus,
    AparteAttachment,
    AparteMessageBranch,
    AparteBubbleActionsConfig,
    AparteBubbleActionName,
    AparteSegment,
    AparteSegmentType,
    AparteTextSegment,
    AparteThinkingSegment,
    AparteCodeSegment,
    AparteTerminalSegment,
    AparteSegmentRenderer,
    AparteCustomSegment,
    AparteToolCallSegment,
    AparteArtifactSegment,
    // AI Provider types (BYORK)
    AparteAIProvider,
    AparteAIModel,
    AparteAIProviderConfigField,
    AparteAIProviderConfigSchema,
    AparteModelConfig,
    ModelStatus,
    ModelLoadProgress,
    AparteModelChangeEventDetail,
    AparteMessageDoneEventDetail,
    AparteMessageInfoEventDetail,
    AparteSiblingInfo,
    AparteBranchNavigateEventDetail,
    ApartePathChangedEventDetail,
    AparteRetryEventDetail,
    AparteEditEventDetail,
    AparteFeedbackEventDetail,
    AparteActionEventDetail,
    AparteArtifactStartEventDetail,
    AparteArtifactDeltaEventDetail,
    AparteArtifactReadyEventDetail,
    AparteArtifactOpenEventDetail,
    // Chat types
    AparteChatRequest,
    AparteChatResponse,
    AparteChatMessage,
    AparteContentPart,
    AparteTextPart,
    AparteImagePart,
    AparteFilePart,
    AparteStreamEvent,
    AparteStreamEventMap,
    AparteUsage,
    // Tool types
    AparteTool,
    AparteToolCall,
    AparteToolResult,
    AparteToolHandler,
    AparteToolRenderer,
    AparteToolDecisionDetail,
    AparteToolApprovalRequestDetail,
    AparteToolActionDetail,
    // Canonical imperative surface (aliased by every wrapper's handle type).
    AparteChatImperativeApi
} from './types/index.js';

export { AparteErrorCode, AparteError, contentToText } from './types/index.js';

// Export renderers
export {
    registerSegmentRenderer,
    unregisterSegmentRenderer,
    getSegmentRenderer,
    collectRendererStyles,
    registerDefaultRenderers
} from './renderers/index.js';

// Export components
export { AparteChat } from './components/index.js';
export { AparteChatBubble, populateBubbleFromMessage } from './components/index.js';
export type { SyncableBubble } from './components/index.js';
export { AparteChatStatus } from './components/index.js';
export { AparteChatViewport } from './components/index.js';

// Export composer primitives
export { AparteComposer, AparteComposerInput, AparteComposerSend, AparteComposerCancel, AparteComposerAttachments, AparteComposerAddAttachment, AparteComposerAction } from './components/index.js';
export type { AparteComposerEventMap, AparteComposerEventType, AparteComposerState, AparteComposerChangeEventDetail } from './components/index.js';

// Export conversation list primitive
export { AparteConversationList } from './components/index.js';
export type { AparteConversationListItem, AparteConversationSelectDetail, AparteConversationDeleteDetail } from './components/index.js';

// Export conversations (types, adapter contract, manager)
export type {
    AparteConversation,
    AparteConversationMeta,
    AparteStorageAdapter,
    AparteMemoryFact,
    AparteArtifactRow,
    AparteAttachmentRow,
} from './conversations/index.js';
export { APARTE_CONVERSATION_SCHEMA_VERSION } from './conversations/index.js';
export { ConversationManager, type ConversationManagerOptions } from './conversations/index.js';
export {
    AparteConversationController,
    type AparteChatBinding,
    type AparteConversationControllerOptions,
} from './conversations/index.js';

// Export the framework-agnostic chat-host orchestrator (streaming/branch/
// host-method layer that every framework wrapper binds to).
export {
    AparteChatHost,
    type AparteChatHostBinding,
    type AparteChatHostOptions,
} from './host/index.js';

// Export parsers
export { AparteStreamParser, parseMarkdownToSegments, deriveArtifactKind } from './parsers/index.js';
export type { AparteStreamParserOptions, AparteThinkingDelimiterPair, AparteParserState, AparteParserResult } from './parsers/index.js';
export { parseAparteEventStream } from './parsers/index.js';

// Export config
export { AparteConfig, AparteConfigClass } from './config/index.js';
export { resolveConfig, attachConfig, detachConfig, runWithConfig, contextConfig, APARTE_HOST_ATTR } from './config/index.js';
export type { AparteMarkdownProvider, AparteStreamingMarkdownProvider, AparteStreamingMarkdownRenderer, AparteHighlightProvider, AparteSystemPromptVarsProvider, AparteSkeletonProvider, AparteSkeletonType, AparteLocale, AparteAction, AparteActionZone, AparteIconProvider, AparteIconName, AparteAvatarProvider, AparteStatusRenderer, AparteErrorRenderer, AparteAttachmentRenderer, AparteSiblingNavRenderer, AparteBubbleShellRenderer, AparteModelPreference, AparteModelPreferenceProvider, AparteArtifactPreviewBuilder, AparteSanitizer } from './config/index.js';
export { DEFAULT_ICON_FALLBACKS, DEFAULT_SKELETON_FALLBACKS, DEFAULT_LOCALE, defaultSanitizer, isSafeUrl } from './config/index.js';

// Export Client
export { AparteClient } from './client/aparte-client.js';

// Custom-element interop helpers shared by the framework wrappers' AparteUi.
export { applyElementProps, DEFAULT_UI_EVENTS } from './interop/element-props.js';
export type { AparteClientOptions, AparteToolApprovalResolver, AparteCompactionSelector } from './client/aparte-client.js';
// Structured-stream adapter — DOM half of the runStreamAgent loop (see stream-adapter.ts).
export { createStreamAdapter, readableToAsyncIterable } from './client/stream-adapter.js';
export type { AparteStreamRunEvent, AparteStreamRunEmitter, StreamAdapterTarget, CreateStreamAdapterOptions, AparteStreamRunner, AparteStreamRunOptions } from './client/stream-adapter.js';

// Export transport seam (where chat requests go + how auth is handled)
export { DirectTransport, BackendTransport, createAparteChatHandler, isFormatAdapter } from './transport/index.js';
export type { AparteTransport, AparteTransportContext, AparteFormatAdapter, AparteVendorRequest, BackendTransportOptions, DirectTransportOptions, AparteChatHandlerOptions } from './transport/index.js';

// Export runtime utilities
export { MessageRepository } from './runtime/message-repository.js';
export type { ExportedMessageRepository } from './runtime/message-repository.js';

// Export elicitation (human-in-the-loop typed input)
export { requestUserInput, buildElicitationPanel } from './elicitation/index.js';
export type {
    AparteElicitationSchema,
    AparteElicitationField,
    AparteElicitationEnumField,
    AparteElicitationBooleanField,
    AparteElicitationStringField,
    AparteElicitationObjectSchema,
    AparteElicitationRequest,
    AparteElicitationResult,
    AparteElicitationPresenter,
    BuiltElicitationPanel,
} from './elicitation/index.js';

// Export the default elicitation presenter Web Component
export { AparteElicitation } from './components/elicitation/aparte-elicitation.js';

// Auto-register components when module is imported
// Components register themselves in their files
import './components/chat/aparte-chat.js';
import './components/bubble/aparte-chat-bubble.js';
import './components/status/aparte-chat-status.js';
import './components/viewport/aparte-chat-viewport.js';
import './components/elicitation/aparte-elicitation.js';
// Import primitives to auto-register
import './primitives/select/aparte-select.js';
import './primitives/select/aparte-option.js';
import './primitives/select/aparte-optgroup.js';

/**
 * Utility to ensure all components are registered
 * Call this if using dynamic imports
 */
export function registerAllComponents(): void {
    // Components self-register, but this ensures imports are not tree-shaken
    const _chat = customElements.get('aparte-chat');
    const _viewport = customElements.get('aparte-chat-viewport');
    const _bubble = customElements.get('aparte-chat-bubble');
    const _status = customElements.get('aparte-chat-status');

    if (!_chat || !_viewport || !_bubble || !_status) {
        console.warn('[Aparte] Some components may not be registered. Ensure all component files are imported.');
    }
}
