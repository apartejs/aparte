/**
 * @aparte/core — Node.js / SSR-safe entry point.
 *
 * Resolved via the `node` export condition, so `import '@aparte/core'` in Node
 * (Next.js / Nuxt / Angular Universal / SvelteKit server, tsx, CLI tools) loads
 * THIS module instead of the browser entry. It exposes the same public API
 * surface MINUS the Web Components and CSS side-effects — importing the real
 * `index.ts` in Node throws `HTMLElement is not defined` because the custom
 * elements extend `HTMLElement` at module scope.
 *
 * Everything re-exported here is DOM-free at import time. Custom-element CLASSES
 * (AparteChatBubble, AparteComposer*, AparteSelect, …) are intentionally NOT exported
 * as runtime values — they only exist in the browser build. Their TYPES are
 * re-exported (types are erased, so they never pull DOM at runtime), which keeps
 * TypeScript consumers fully typed on the server; `registerAllComponents()` is a
 * no-op here (there is nothing to register without a DOM).
 */

// ── Types (erased at runtime — always safe, mirror index.ts) ────────────────
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
    AparteTool,
    AparteToolCall,
    AparteToolResult,
    AparteToolHandler,
    AparteToolRenderer,
    AparteToolDecisionDetail,
    AparteToolApprovalRequestDetail,
    AparteToolActionDetail,
} from './types/index.js';
export { AparteErrorCode, AparteError, contentToText } from './types/index.js';

// Custom-element TYPES (erased) — keep server consumers fully typed.
export type { AparteSelectChangeDetail } from './primitives/index.js';
export type { SyncableBubble, AparteComposerEventMap, AparteComposerEventType } from './components/index.js';
export type { AparteConversationListItem, AparteConversationSelectDetail, AparteConversationDeleteDetail } from './components/index.js';

// ── Renderers (produce HTML strings; DOM-free at import) ────────────────────
export {
    registerSegmentRenderer,
    unregisterSegmentRenderer,
    getSegmentRenderer,
    collectRendererStyles,
    registerDefaultRenderers,
} from './renderers/index.js';

// `populateBubbleFromMessage` is a plain helper — import it from its own module,
// NOT the components barrel (which would pull in the HTMLElement classes).
export { populateBubbleFromMessage } from './components/bubble/bubble-sync.js';

// ── Conversations (types, adapter contract, manager, controller) ────────────
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

// ── Framework-agnostic chat-host orchestrator (every wrapper binds to it) ───
export {
    AparteChatHost,
    type AparteChatHostBinding,
    type AparteChatHostOptions,
} from './host/index.js';

// ── Parsers ─────────────────────────────────────────────────────────────────
export { AparteStreamParser, parseMarkdownToSegments, deriveArtifactKind } from './parsers/index.js';
export type { AparteStreamParserOptions, AparteThinkingDelimiterPair, AparteParserState, AparteParserResult } from './parsers/index.js';

// Server-side `/api/chat` handler for BackendTransport — DOM-free, uses only the
// Web fetch API, so it belongs on the Node/SSR surface (a browser never runs it).
export { createAparteChatHandler } from './transport/backend-handler.js';
export type { AparteChatHandlerOptions } from './transport/backend-handler.js';

// ── Config ──────────────────────────────────────────────────────────────────
export { AparteConfig, AparteConfigClass } from './config/index.js';
export { resolveConfig, attachConfig, detachConfig, runWithConfig, contextConfig, APARTE_HOST_ATTR } from './config/index.js';
export type {
    AparteMarkdownProvider,
    AparteStreamingMarkdownProvider,
    AparteStreamingMarkdownRenderer,
    AparteHighlightProvider,
    AparteSystemPromptVarsProvider,
    AparteSkeletonProvider,
    AparteSkeletonType,
    AparteLocale,
    AparteAction,
    AparteActionZone,
    AparteIconProvider,
    AparteIconName,
    AparteModelPreference,
    AparteModelPreferenceProvider,
    AparteArtifactPreviewBuilder,
    AparteSanitizer,
} from './config/index.js';
export { DEFAULT_ICON_FALLBACKS, DEFAULT_SKELETON_FALLBACKS, DEFAULT_LOCALE, defaultSanitizer, isSafeUrl } from './config/index.js';

// ── Client + runtime ─────────────────────────────────────────────────────────
export { AparteClient } from './client/aparte-client.js';
export type { AparteClientOptions } from './client/aparte-client.js';
export { createStreamAdapter, readableToAsyncIterable } from './client/stream-adapter.js';
export type { AparteStreamRunEvent, AparteStreamRunEmitter, StreamAdapterTarget, CreateStreamAdapterOptions, AparteStreamRunner, AparteStreamRunOptions } from './client/stream-adapter.js';
export { MessageRepository } from './runtime/message-repository.js';
export type { ExportedMessageRepository } from './runtime/message-repository.js';

// Elicitation (human-in-the-loop typed input) — DOM-free at import.
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

/**
 * No-op on the server: custom elements only exist in the browser, where the
 * real `index.ts` registers them at import time. Wrappers can call this
 * unconditionally without a `typeof window` guard.
 */
export function registerAllComponents(): void {
    /* browser-only — nothing to register without a DOM */
}
