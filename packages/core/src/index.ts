/**
 * Aparte
 * High-performance AI conversation engine in Vanilla TypeScript
 * Zero-dependency Web Components for LLM streaming
 *
 * ⚠️ This is the **browser** entry: it defines the custom elements and imports CSS
 * at module scope, so it needs a DOM. **Node resolves `index.node.ts` instead**
 * (via the `node` condition in package.json) — a DOM-free entry with the client,
 * host, transports, the chat handler and every type. This file sits first in the
 * exports map only because of the repo-local `@aparte-workspace/source` condition,
 * which is why reading it can look like "this package can't run in Node".
 * See the "Node / SSR" section of the README.
 *
 * @packageDocumentation
 */
import './styles/aparte.css';
import './primitives/select/select.css';
import './primitives/progress-spinner/progress-spinner.css';

// Global HTMLElementEventMap augmentation — typed `e.detail` for aparté events.
import './types/event-map.js';
// Global HTMLElementTagNameMap augmentation — `querySelector('aparte-…')` returns
// the concrete element, not `Element`. Both are DOM-only, hence browser-entry only.
import './types/element-map.js';

// Export primitives
export { AparteSelect, AparteOption, AparteOptgroup, type AparteSelectChangeDetail, type AparteOptgroupToggleEventDetail, AparteProgressSpinner } from './primitives/index.js';

// Export types
export type {
    AparteBubbleRole,
    AparteMessage,
    AparteContentParser,
    AparteSendEventDetail,
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
    AparteSegmentRenderer,
    AparteCustomSegment,
    AparteToolCallSegment,
    AparteArtifactSegment,
    // The detail of the `aparte-segment-update` event. It reached types/index.ts and
    // stopped there — and types/index.ts is not an entry point, so a consumer could
    // bind the event (it is in the published event table) and never name its detail.
    AparteSegmentUpdateEventDetail,
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
    AparteMessageStartEventDetail,
    AparteMessageErrorEventDetail,
    AparteMessageAbortedEventDetail,
    AparteAbortEventDetail,
    AparteCompactEventDetail,
    AparteCompactDoneEventDetail,
    AparteCompactErrorEventDetail,
    AparteAttachmentPreviewEventDetail,
    AparteFileGenReadyEventDetail,
    AparteFileGenErrorEventDetail,
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
    AparteArtifactRedownloadEventDetail,
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
    AparteToolContext,
    AparteToolRenderer,
    AparteToolApprovalRequestDetail,
    // Canonical imperative surface (aliased by every wrapper's handle type).
    AparteChatImperativeApi,
    // The attribute surface of every element, for the wrappers to map over.
    AparteElementAttributes,
    AparteElementTagName,
    AparteAttrValue,
    AparteTemplateAttrs,
    AparteNoAttributes,
    AparteChatAttributes,
    AparteChatViewportAttributes,
    AparteChatBubbleAttributes,
    AparteChatStatusAttributes,
    AparteComposerAttributes,
    AparteComposerInputAttributes,
    AparteComposerActionAttributes,
    AparteComposerAddAttachmentAttributes,
    AparteComposerToolbarAttributes,
    AparteConversationListAttributes,
    AparteSelectAttributes,
    AparteOptionAttributes,
    AparteOptgroupAttributes,
    AparteProgressSpinnerAttributes,
} from './types/index.js';

export { AparteErrorCode, AparteError, contentToText } from './types/index.js';

// Export renderers
export {
    registerSegmentRenderer,
    unregisterSegmentRenderer,
    getSegmentRenderer,
    collectRendererStyles,
    registerDefaultRenderers,
    // The three the public barrel left behind. `renderers/index.ts` has always
    // exported all eight; this one published five, which made the registry
    // half-public: `declineDefaultRenderers` is the ONLY way to say "do not install
    // the built-ins on this config" without constructing an `AparteClient`
    // (`autoRegister: false`), and the bring-your-own-loop guide tells you not to
    // construct one. `installDefaultRenderersOnce` is what a hand-written bubble
    // needs, and `getAllRenderers` is the introspection half — the same reason
    // `hasHighlightProvider` and `renderMarkdown` are public.
    installDefaultRenderersOnce,
    declineDefaultRenderers,
    getAllRenderers
} from './renderers/index.js';

// Export components
export { AparteChat } from './components/index.js';
export { AparteChatBubble, populateBubbleFromMessage } from './components/index.js';
export type { SyncableBubble } from './components/index.js';
export { AparteChatStatus } from './components/index.js';
export { AparteChatViewport } from './components/index.js';

// Export composer primitives
export { AparteComposer, AparteComposerInput, AparteComposerSend, AparteComposerCancel, AparteComposerAttachments, AparteComposerAddAttachment, AparteComposerAction, AparteComposerToolbar } from './components/index.js';
export type { AparteComposerEventMap, AparteComposerEventType, AparteComposerState, AparteComposerChangeEventDetail, AparteActionClickEventDetail } from './components/index.js';

// Export conversation list primitive
export { AparteConversationList } from './components/index.js';
export type { AparteConversationListItem, AparteConversationSelectDetail, AparteConversationDeleteDetail, AparteConversationArchiveDetail } from './components/index.js';

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
export { AparteConversationManager, type ConversationManagerOptions } from './conversations/index.js';
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
export { aparteGlobalConfig, AparteConfig, APARTE_DEFAULT_BUBBLE_ACTIONS, APARTE_DEFAULT_HOST_HANDLERS } from './config/index.js';
export type { AparteConfigChangeEventDetail } from './config/index.js';
export { resolveConfig, attachConfig, detachConfig, runWithConfig, contextConfig, APARTE_HOST_ATTR } from './config/index.js';
export { subscribeConfigChange, APARTE_CONFIG_CHANGE } from './config/index.js';
export type { AparteConfigAware } from './config/index.js';
export type { AparteMarkdownProvider, AparteStreamingMarkdownProvider, AparteStreamingMarkdownRenderer, AparteHighlightProvider, AparteSystemPromptVarsProvider, AparteSkeletonProvider, AparteSkeletonType, AparteLocale, AparteAction, AparteActionZone, AparteIconProvider, AparteIconName, AparteAvatarProvider, AparteStatusRenderer, AparteErrorRenderer, AparteAttachmentRenderer, AparteElicitationFieldRenderer, AparteElicitationFieldContext, AparteElicitationFieldControl, AparteSiblingNavRenderer, AparteBubbleShellRenderer, AparteModelPreference, AparteModelPreferenceProvider, AparteArtifactPreviewBuilder, AparteSanitizer } from './config/index.js';
export { APARTE_DEFAULT_ICON_FALLBACKS, APARTE_DEFAULT_SKELETON_FALLBACKS, APARTE_DEFAULT_LOCALE, defaultSanitizer, isSafeUrl } from './config/index.js';

// Export Client
export { AparteClient } from './client/aparte-client.js';

// Custom-element interop helpers shared by the framework wrappers' AparteUi.
export { applyElementProps, APARTE_DEFAULT_UI_EVENTS } from './interop/element-props.js';
export type { AparteUiEventName } from './interop/element-props.js';
// Turns the `File[]` an `aparte-send` carries into renderable attachments — the
// same conversion ConversationController does, for consumers driving the
// imperative API themselves.
export { filesToAttachments, revokeAttachmentUrls } from './utils/files-to-attachments.js';
// Is a message waiting for a reply? Shared by the viewport, the four wrappers and
// any consumer rendering its own bubble — one rule, so they can't disagree.
export { isAwaitingReply } from './utils/is-awaiting-reply.js';

// HTML escaping — one implementation for the whole scope. Exported because the
// plugins render their own HTML (they cannot reach into core's internals) and
// because a consumer writing a render hook needs it for exactly the same reason.
// Nine private copies existed before this line; three of them had drifted to
// escape only four of the five characters that matter.
export { escapeHtml, escapeAttr } from './utils/escape.js';
// `cssEscape` belongs beside them: `pnpm check:attr-escaping` tells a renderer
// author "in a selector, use cssEscape()", and the customization guide says the
// same — while it was not exported at all, so the only way to follow that advice
// was `CSS.escape`, which over-escapes inside a quoted attribute selector.
export { cssEscape } from './utils/css-escape.js';
// Exported because the same wall is hit outside core: a wrapper naming its host
// element, a provider tagging a request, or any bring-your-own-loop consumer
// generating message ids all reach for `crypto.randomUUID`, which does not exist
// on `http://` — the LAN deployment this library's own audience runs.
export { uuid } from './utils/uuid.js';
// A segment's own completion rule, and the two readers of what core measured.
// Exported because a consumer rendering "thought for 8 s" needs to know when the span
// closed, and a rule kept private is a rule re-derived slightly differently outside —
// the tool call is the trap: it settles by `status`, never by `isStreaming`.
//
// `segmentTiming` joins them because the measurements moved into `meta.aparte`, and
// `segment.meta?.aparte` spelled at each call site is the same rule re-derived by hand
// — exactly what the other two are exported to prevent.
//
// The WRITERS stay internal: only the two owners of a message's segment array may
// stamp those fields, which `pnpm check:segment-stamp` enforces.
export { isSegmentSettled, segmentDuration, segmentTiming } from './utils/segments.js';
// The PARAMETER types of two documented setters. They existed and were the declared
// argument types, but were not exported — so anyone typing a settings layer over
// `setHostHandlers` / `setKeyProvider` had to re-declare the shape by hand.
export type { AparteHostHandlersConfig } from './types/models.js';
export type { AparteKeyProvider } from './config/aparte-config.js';
export type { AparteClientOptions, AparteToolApprovalResolver, AparteCompactionSelector } from './client/aparte-client.js';
// Structured-stream adapter — DOM half of the runStreamAgent loop (see stream-adapter.ts).
export { createStreamAdapter, readableToAsyncIterable } from './client/stream-adapter.js';
export type { AparteStreamRunEvent, AparteStreamRunEmitter, StreamAdapterTarget, CreateStreamAdapterOptions, AparteStreamRunner, AparteStreamRunOptions } from './client/stream-adapter.js';

// Export transport seam (where chat requests go + how auth is handled)
export { AparteDirectTransport, AparteBackendTransport, createAparteChatHandler, isFormatAdapter } from './transport/index.js';
export type { AparteTransport, AparteTransportContext, AparteFormatAdapter, AparteVendorRequest, BackendTransportOptions, DirectTransportOptions, AparteChatHandlerOptions } from './transport/index.js';

// Export runtime utilities
export { AparteMessageRepository } from './runtime/message-repository.js';
export type { ExportedMessageRepository } from './runtime/message-repository.js';

// Export elicitation (human-in-the-loop typed input)
export { requestUserInput, buildElicitationPanel, buildApprovalPanel, AparteElicitationAbortError } from './elicitation/index.js';
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
    AparteApprovalOption,
    AparteApprovalAnswer,
    BuiltApprovalPanel,
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
