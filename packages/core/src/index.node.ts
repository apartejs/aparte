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
    // The detail of the `aparte-segment-update` event. It reached types/index.ts and
    // stopped there — and types/index.ts is not an entry point, so a consumer could
    // bind the event (it is in the published event table) and never name its detail.
    AparteSegmentUpdateEventDetail,
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
    AparteTerminalRunEventDetail,
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
    AparteToolContext,
    AparteToolRenderer,
    AparteToolDecisionDetail,
    AparteToolApprovalRequestDetail,
    AparteChatImperativeApi,
} from './types/index.js';
export { AparteErrorCode, AparteError, contentToText } from './types/index.js';

// Custom-element TYPES (erased) — keep server consumers fully typed.
export type { AparteSelectChangeDetail, AparteOptgroupToggleEventDetail } from './primitives/index.js';
export type { SyncableBubble, AparteComposerEventMap, AparteComposerEventType, AparteComposerState, AparteComposerChangeEventDetail, AparteActionClickEventDetail } from './components/index.js';
export type { AparteConversationListItem, AparteConversationSelectDetail, AparteConversationDeleteDetail, AparteConversationArchiveDetail } from './components/index.js';

// ── Renderers (produce HTML strings; DOM-free at import) ────────────────────
export {
    registerSegmentRenderer,
    unregisterSegmentRenderer,
    getSegmentRenderer,
    collectRendererStyles,
    registerDefaultRenderers,
    installDefaultRenderersOnce,
    declineDefaultRenderers,
    getAllRenderers,
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
export { AparteConversationManager, type ConversationManagerOptions } from './conversations/index.js';
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
export { AparteStreamParser, parseMarkdownToSegments, deriveArtifactKind, parseAparteEventStream } from './parsers/index.js';
export type { AparteStreamParserOptions, AparteThinkingDelimiterPair, AparteParserState, AparteParserResult } from './parsers/index.js';

// Transport seam — DOM-free (fetch-based), so the whole seam is SSR-safe. The
// server-side `/api/chat` handler AND both client transports live here; a browser
// never runs the handler, and the transports touch no DOM at import. Mirrored in
// full so a wrapper barrel re-exporting a transport can't crash under SSR.
export { AparteDirectTransport, AparteBackendTransport, createAparteChatHandler, isFormatAdapter } from './transport/index.js';
export type {
    AparteTransport,
    AparteTransportContext,
    AparteFormatAdapter,
    AparteVendorRequest,
    BackendTransportOptions,
    DirectTransportOptions,
    AparteChatHandlerOptions,
} from './transport/index.js';

// ── Config ──────────────────────────────────────────────────────────────────
export { aparteGlobalConfig, AparteConfig, APARTE_DEFAULT_BUBBLE_ACTIONS, APARTE_DEFAULT_HOST_HANDLERS } from './config/index.js';
export type { AparteConfigChangeEventDetail } from './config/index.js';
export { resolveConfig, attachConfig, detachConfig, runWithConfig, contextConfig, APARTE_HOST_ATTR } from './config/index.js';
export { subscribeConfigChange, APARTE_CONFIG_CHANGE } from './config/index.js';
export type { AparteConfigAware } from './config/index.js';
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
    AparteAvatarProvider,
    AparteStatusRenderer,
    AparteErrorRenderer,
    AparteAttachmentRenderer,
    AparteElicitationFieldRenderer,
    AparteElicitationFieldContext,
    AparteElicitationFieldControl,
    AparteSiblingNavRenderer,
    AparteBubbleShellRenderer,
    AparteModelPreference,
    AparteModelPreferenceProvider,
    AparteArtifactPreviewBuilder,
    AparteSanitizer,
} from './config/index.js';
export { APARTE_DEFAULT_ICON_FALLBACKS, APARTE_DEFAULT_SKELETON_FALLBACKS, APARTE_DEFAULT_LOCALE, defaultSanitizer, isSafeUrl } from './config/index.js';

// ── Client + runtime ─────────────────────────────────────────────────────────
export { AparteClient } from './client/aparte-client.js';
export type { AparteClientOptions, AparteToolApprovalResolver, AparteCompactionSelector } from './client/aparte-client.js';
export { createStreamAdapter, readableToAsyncIterable } from './client/stream-adapter.js';
export type { AparteStreamRunEvent, AparteStreamRunEmitter, StreamAdapterTarget, CreateStreamAdapterOptions, AparteStreamRunner, AparteStreamRunOptions } from './client/stream-adapter.js';
export { AparteMessageRepository } from './runtime/message-repository.js';
export type { ExportedMessageRepository } from './runtime/message-repository.js';

// ── Wrapper interop (DOM-free helpers the four wrappers' AparteUi value-imports) ─
// `applyElementProps`/`APARTE_DEFAULT_UI_EVENTS` are pure (a string array + a function that
// only touches its `HTMLElement` argument when CALLED, never at import). They MUST be
// on the Node surface: every wrapper barrel re-exports `AparteUi`, which value-imports
// these two — omit them here and any SSR toolchain resolving the `node` condition
// crashes the whole barrel with "does not provide an export named 'applyElementProps'".
export { applyElementProps, APARTE_DEFAULT_UI_EVENTS } from './interop/element-props.js';
// Same rule: DOM-free at import (it only reaches for `URL.createObjectURL` when
// CALLED, which is a browser-side concern), so it belongs on the SSR surface too.
export { filesToAttachments, revokeAttachmentUrls } from './utils/files-to-attachments.js';

/*
 * The global type augmentations, which only the BROWSER entry pulled in.
 *
 * TypeScript applies the `node` export condition under `moduleResolution: node16`
 * / `nodenext`, so a consumer in that mode resolves `index.node.d.ts` — and
 * silently lost typed `e.detail` on every aparté event and typed
 * `querySelector('aparte-…')`. Not a runtime concern and not an SSR hazard: both
 * modules are `import type` throughout, so nothing is emitted and no DOM global is
 * touched. `check:node-barrel-types` diffed export NAMES, which an augmentation
 * has none of, so it saw nothing.
 */
import './types/event-map.js';
import './types/element-map.js';
// Is a message waiting for a reply? Shared by the viewport, the four wrappers and
// any consumer rendering its own bubble — one rule, so they can't disagree.
export { isAwaitingReply } from './utils/is-awaiting-reply.js';
export { escapeHtml, escapeAttr } from './utils/escape.js';
// Same reasoning as the browser barrel: the gate script and the customization
// guide both tell a renderer author to use `cssEscape` for a selector, so it has to
// be importable. It touches no DOM, so the SSR barrel carries it too.
export { cssEscape } from './utils/css-escape.js';
export { uuid } from './utils/uuid.js';
// Pure and DOM-free, so the SSR barrel carries it too — and that is the point: a
// consumer can assert their own duration logic in Node, with no browser.
export { isSegmentSettled, segmentDuration } from './utils/segments.js';
// The PARAMETER types of two documented setters. They existed and were the declared
// argument types, but were not exported — so anyone typing a settings layer over
// `setHostHandlers` / `setKeyProvider` had to re-declare the shape by hand.
export type { AparteHostHandlersConfig } from './types/models.js';
export type { AparteKeyProvider } from './config/aparte-config.js';

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
