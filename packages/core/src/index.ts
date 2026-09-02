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
import './styles/theme.css';
import './styles/base.css';
import './styles/button.css';
import './styles/field.css';
import './styles/display/avatar.css';
import './styles/display/icon.css';
import './styles/display/badge.css';
import './styles/display/tag.css';
import './styles/display/thumbnail.css';
import './styles/display/spinner.css';
import './styles/display/progress.css';
import './styles/display/skeleton.css';
import './styles/display/divider.css';
import './styles/display/alert.css';
import './styles/display/card.css';
import './styles/display/kbd.css';
import './styles/display/mark.css';
import './styles/surface/tabs.css';
import './styles/surface/accordion.css';
import './styles/surface/menu.css';
import './styles/surface/popover.css';
import './styles/surface/dialog.css';
import './styles/surface/tooltip.css';
import './styles/primitives/select.css';
import './styles/primitives/progress-spinner.css';
import './styles/components/shell.css';
import './styles/components/bubble.css';
import './styles/components/composer.css';
import './styles/segment/thinking.css';
import './styles/segment/code.css';
import './styles/segment/tool-call.css';
import './styles/segment/error.css';
import './styles/segment/text.css';
import './styles/components/elicitation.css';
import './styles/components/conversation.css';
import './styles/components/suggestions.css';
import './styles/components/context.css';
import './styles/components/scroll-rail.css';
import './styles/shell/sidebar.css';
import './styles/shell/app-header.css';
import './styles/shell/app-shell.css';
import './styles/shell/split.css';
import './styles/prose.css';
import './styles/responsive.css';

// Global HTMLElementEventMap augmentation — typed `e.detail` for aparté events.
import './types/event-map.js';
// Global HTMLElementTagNameMap augmentation — `querySelector('aparte-…')` returns
// the concrete element, not `Element`. Both are DOM-only, hence browser-entry only.
import './types/element-map.js';

// Export primitives
export { AparteSelect, AparteOption, AparteOptgroup, type AparteSelectChangeDetail, type AparteOptgroupToggleEventDetail, AparteProgressSpinner, AparteIcon } from './primitives/index.js';

// Export types
export type {
    AparteBubbleRole,
    AparteMessage,
    AparteContentParser,
    AparteStreamBlock,
    AparteStreamBlockMatch,
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
    // Five shapes that were public in everything but name. `AparteSegment` is exported
    // and its union names all its members, yet the error segment could not be written
    // down: narrowing on `type: 'error'` gave a
    // consumer the shape and no way to declare a variable of it. `AparteSegmentBase` is
    // worse than an omission: it is the CONSTRAINT on the exported
    // `AparteSegmentRenderer<T>`, so writing a renderer for a segment type of your own
    // required naming a type the package does not export. `AparteSegmentTiming` types
    // `meta.aparte`, and `AparteSegmentDefaults` types what `setSegmentDefaults` takes.
    AparteSegmentBase,
    AparteSegmentDefaults,
    AparteSegmentTiming,
    AparteErrorSegment,
    // The detail of the `aparte-segment-update` event. It reached types/index.ts and
    // stopped there — and types/index.ts is not an entry point, so a consumer could
    // bind the event (it is in the published event table) and never name its detail.
    AparteSegmentUpdateEventDetail,
    // AI Provider types (BYORK)
    AparteAIProvider,
    AparteAIModel,
    AparteAIProviderConfigField,
    AparteAIProviderMetadata,
    AparteAIProviderConfigSchema,
    AparteModelConfig,
    ModelStatus,
    ModelLoadProgress,
    AparteModelChangeEventDetail,
    AparteApprovalModeChangeEventDetail,
    AparteMessageDoneEventDetail,
    AparteMessageStartEventDetail,
    AparteMessageErrorEventDetail,
    AparteMessageAbortedEventDetail,
    AparteAbortEventDetail,
    AparteCompactEventDetail,
    AparteCompactDoneEventDetail,
    AparteCompactStartEventDetail,
    AparteCompactErrorEventDetail,
    AparteAttachmentPreviewEventDetail,
    AparteLinkClickEventDetail,
    AparteMessageInfoEventDetail,
    AparteSiblingInfo,
    AparteBranchNavigateEventDetail,
    ApartePathChangedEventDetail,
    AparteRetryEventDetail,
    AparteEditEventDetail,
    AparteFeedbackEventDetail,
    AparteActionEventDetail,
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
    AparteApprovalPolicy,
    AparteApprovalRuling,
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
export type { AparteComposerEventMap, AparteComposerEventType, AparteComposerState, AparteComposerChangeEventDetail, AparteComposerPanelMode, AparteActionClickEventDetail } from './components/index.js';
export { AparteSuggestions } from './components/index.js';
export type { AparteSuggestion, AparteSuggestionEventDetail } from './components/index.js';
export { AparteContext } from './components/index.js';
export type { AparteContextLevel, AparteContextThresholdEventDetail } from './components/index.js';
export { AparteScrollRail } from './components/index.js';
export type { AparteScrollRailJumpDetail, AparteScrollRailEvery } from './components/index.js';
export { AparteSidebar } from './components/index.js';
export type { AparteSidebarToggleDetail } from './components/index.js';
export { AparteSplit } from './components/index.js';
export type { AparteSplitResizeDetail } from './components/index.js';

// Export conversation list primitive
export { AparteConversationList } from './components/index.js';
export type { AparteConversationListItem, AparteConversationSelectDetail, AparteConversationDeleteDetail, AparteConversationArchiveDetail, AparteConversationPinDetail, AparteConversationRenameDetail } from './components/index.js';

// Export conversations (types, adapter contract, manager)
export type {
    AparteConversation,
    AparteConversationMeta,
    AparteStorageAdapter,
    AparteAttachmentRow,
} from './conversations/index.js';
export { APARTE_CONVERSATION_SCHEMA_VERSION } from './conversations/index.js';
export {
    AparteConversationManager,
    type ConversationManagerOptions,
    type AparteConversationTitleProvider,
} from './conversations/index.js';
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
export { AparteStreamParser, parseMarkdownToSegments } from './parsers/index.js';
export type { AparteStreamParserOptions, AparteThinkingDelimiterPair, AparteParserState, AparteParserResult } from './parsers/index.js';
export { parseAparteEventStream } from './parsers/index.js';

// Export config
export { aparteGlobalConfig, AparteConfig, APARTE_DEFAULT_BUBBLE_ACTIONS, APARTE_DEFAULT_HOST_HANDLERS } from './config/index.js';
export type { AparteConfigChangeEventDetail } from './config/index.js';
export { resolveConfig, attachConfig, detachConfig, runWithConfig, contextConfig, APARTE_HOST_ATTR } from './config/index.js';
export { subscribeConfigChange, APARTE_CONFIG_CHANGE } from './config/index.js';
export type { AparteConfigAware } from './config/index.js';
export type { AparteMarkdownProvider, AparteStreamingMarkdownProvider, AparteStreamingMarkdownRenderer, AparteHighlightProvider, AparteSystemPromptVarsProvider, AparteLocale, AparteLocaleExtensions, AparteAction, AparteActionZone, AparteIconProvider, AparteIconName, AparteAvatarProvider, AparteStatusRenderer, AparteErrorRenderer, AparteAttachmentRenderer, AparteElicitationFieldRenderer, AparteElicitationFieldContext, AparteElicitationFieldControl, AparteSiblingNavRenderer, AparteBubbleShellRenderer, AparteModelPreference, AparteModelPreferenceProvider, AparteSanitizer } from './config/index.js';
export { APARTE_DEFAULT_ICON_FALLBACKS, APARTE_DEFAULT_LOCALE, defaultSanitizer, isSafeUrl } from './config/index.js';

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
// Same wall, same reason: `navigator.clipboard` is undefined on `http://`, and a
// consumer's own copy button hits it exactly as core's three did.
export { copyText } from './utils/copy-text.js';
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
export type { AparteClientOptions, AparteToolApprovalResolver } from './client/aparte-client.js';
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

// Every element class, imported by VALUE. This is what replaced the eight
// side-effect imports that used to sit here ("components register themselves in their
// files"): a side-effect import keeps a module, but it names nothing a reader can check,
// and the list had fallen eight modules behind the twenty-four elements core defines.
// Naming the classes makes the anchor and the registry the same list — see
// `APARTE_ELEMENTS` below.
import {
    AparteChat,
    AparteChatBubble,
    AparteChatStatus,
    AparteChatViewport,
    AparteComposer,
    AparteComposerInput,
    AparteComposerSend,
    AparteComposerCancel,
    AparteComposerAttachments,
    AparteComposerAddAttachment,
    AparteComposerAction,
    AparteComposerToolbar,
    AparteConversationList,
    AparteScrollRail,
    AparteSidebar,
    AparteSplit,
    AparteSuggestions,
    AparteContext,
} from './components/index.js';
import { AparteElicitation as AparteElicitationElement } from './components/elicitation/aparte-elicitation.js';
import {
    AparteSelect,
    AparteOption,
    AparteOptgroup,
    AparteProgressSpinner,
    AparteIcon,
} from './primitives/index.js';

/**
 * Every tag core defines, beside the class that defines it.
 *
 * Two jobs, and they are the same list on purpose. It is what the warning below reads,
 * so the function can NAME the tags that are missing instead of saying "some
 * components"; and it is the single list `src/__tests__/register-all-components.test.ts`
 * holds against every `customElements.define` literal in the source.
 *
 * What it is NOT is what keeps those 24 `define` calls alive, and the difference is
 * worth stating because the opposite is easy to assume. The browser build is ONE
 * module — `dist/index.js` — and `package.json`'s `sideEffects` names it, so no
 * bundler drops it; all 24 calls sit in it as top-level statements whatever this array
 * references. Naming the classes buys the warning, not the registrations.
 *
 * It used to check four tags out of twenty-four and log "Some components may not be
 * registered", which is the two failures a guide cannot survive: a consumer whose
 * bundler dropped `<aparte-split>` got a silent green, and a consumer who got the
 * warning had no idea which element to import.
 *
 * `src/types/__tests__/element-map.test.ts` reads the same
 * `customElements.define` literals out of the source, so this list cannot fall behind
 * them again without a red test.
 */
const APARTE_ELEMENTS: ReadonlyArray<readonly [string, CustomElementConstructor]> = [
    // Chat shell + transcript
    ['aparte-chat', AparteChat],
    ['aparte-chat-viewport', AparteChatViewport],
    ['aparte-chat-bubble', AparteChatBubble],
    ['aparte-chat-status', AparteChatStatus],

    // Composer and its primitives
    ['aparte-composer', AparteComposer],
    ['aparte-composer-input', AparteComposerInput],
    ['aparte-composer-send', AparteComposerSend],
    ['aparte-composer-cancel', AparteComposerCancel],
    ['aparte-composer-attachments', AparteComposerAttachments],
    ['aparte-composer-add-attachment', AparteComposerAddAttachment],
    ['aparte-composer-action', AparteComposerAction],
    ['aparte-composer-toolbar', AparteComposerToolbar],

    // Standalone components
    ['aparte-conversation-list', AparteConversationList],
    ['aparte-elicitation', AparteElicitationElement],
    ['aparte-scroll-rail', AparteScrollRail],
    ['aparte-sidebar', AparteSidebar],
    ['aparte-split', AparteSplit],
    ['aparte-suggestions', AparteSuggestions],
    ['aparte-context', AparteContext],

    // Primitives
    ['aparte-select', AparteSelect],
    ['aparte-option', AparteOption],
    ['aparte-optgroup', AparteOptgroup],
    ['aparte-progress-spinner', AparteProgressSpinner],
    ['aparte-icon', AparteIcon],
];

/**
 * Make sure every element core defines is in the registry, and say which are not.
 *
 * Importing `@aparte/core` already registers all of them. Call this when a bundler with
 * aggressive side-effect elimination, or a dynamic `import()`, might have dropped the
 * modules — the call itself is what keeps them, because it reaches `APARTE_ELEMENTS`.
 *
 * Idempotent, and safe to call more than once: it defines nothing, it reports.
 */
export function registerAllComponents(): void {
    const missing = APARTE_ELEMENTS.filter(([tag]) => !customElements.get(tag)).map(([tag]) => tag);
    if (missing.length > 0) {
        console.warn(
            `[aparte] ${missing.length} of ${APARTE_ELEMENTS.length} elements are not registered: `
                + `${missing.join(', ')}. Import '@aparte/core' at module scope (not behind a lazy `
                + `import()), and check that your bundler is honouring the package's sideEffects field.`,
        );
    }
}

// The dialog wiring — three `data-aparte-dialog-*` attributes on the browser's own
// <dialog>, installed once at import like the default renderers. Exported for a host
// that builds its page before importing core; idempotent.
import { installDialogTriggersOnce } from './interop/dialog-triggers.js';
export { installDialogTriggersOnce };
if (typeof document !== 'undefined') installDialogTriggersOnce();
