/**
 * Aparte Type Definitions
 * 
 * Zero-dependency conversation engine types
 * All interfaces are generic and technology-agnostic
 * 
 * @packageDocumentation
 */

// ─────────────────────────────────────────────────────────────────────────────
// Models - Core data structures
// ─────────────────────────────────────────────────────────────────────────────

export type {
    AparteStatus,
    AparteBubbleRole,
    AparteAttachment,
    AparteMessage,
    AparteContextSummary,
    AparteMessageBranch,
    AparteBubbleActionsConfig,
    AparteBubbleActionName,
    AparteViewportConfig,
    AparteInputConfig
} from './models.js';

export type { AparteStreamBlock, AparteStreamBlockMatch } from './stream-blocks.js';
export type { AparteCompactor, AparteCompactorRequest, AparteCompactorOutcome, AparteCompactorReason } from './compactor.js';

// ─────────────────────────────────────────────────────────────────────────────
// Events - Component communication
// ─────────────────────────────────────────────────────────────────────────────

export type {
    AparteSendEventDetail,
    AparteSiblingInfo,
    AparteBranchNavigateEventDetail,
    AparteLinkClickEventDetail,
    ApartePathChangedEventDetail,
    AparteRetryEventDetail,
    AparteEditEventDetail,
    AparteFeedbackEventDetail,
    AparteActionEventDetail
} from './events.js';

// ─────────────────────────────────────────────────────────────────────────────
// Parsers - Content transformation plugins
// ─────────────────────────────────────────────────────────────────────────────

export type {
    AparteContentParser,
    AparteParserRegistry
} from './parsers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Segments - Rich content segments for messages
// ─────────────────────────────────────────────────────────────────────────────

export type {
    AparteSegmentBase,
    AparteSegmentDefaults,
    AparteSegmentTiming,
    AparteTextSegment,
    AparteSource,
    AparteCitation,
    AparteThinkingSegment,
    AparteCodeSegment,
    AparteErrorSegment,
    AparteSegment,
    AparteSegmentTypes,
    AparteCustomSegment,
    AparteToolCallSegment,
    AparteSegmentType,
    AparteSegmentRenderer,
    AparteSegmentMount,
    AparteSegmentUpdateEventDetail
} from './segments.js';

// ─────────────────────────────────────────────────────────────────────────────
// Providers - Data source abstractions
// ─────────────────────────────────────────────────────────────────────────────

// `providers.ts` used to be re-exported here: `AparteDataProvider`,
// `AparteStreamProvider`, `AparteMessageStore`, `AparteControlHandler`. Implemented
// by nothing, consumed by nothing, and superseded by `AparteTransport` /
// `AparteFormatAdapter` / `AparteMessageRepository` — so the type barrel carried two
// competing "provider" abstractions and a reader could not tell which was live.

// ─────────────────────────────────────────────────────────────────────────────
// Theming - CSS Custom Properties
// ─────────────────────────────────────────────────────────────────────────────

export type {
    AparteThemeVariables
} from './theming.js';

// ─────────────────────────────────────────────────────────────────────────────
// AI Model Providers - BYORK (Bring Your Own Key)
// ─────────────────────────────────────────────────────────────────────────────

export type {
    AparteAIModel,
    AparteAIProvider,
    AparteAIProviderMetadata,
    AparteAIProviderConfigField,
    AparteAIProviderConfigSchema,
    AparteModelConfig,
    ModelStatus,
    ModelLoadProgress
} from './model-provider.js';

export type {
    AparteChatRequest,
    AparteRequestMeta,
    AparteChatResponse,
    AparteChatMessage,
    AparteContentPart,
    AparteTextPart,
    AparteImagePart,
    AparteStreamEvent,
    AparteStreamEventMap,
    AparteUsage,
    AparteFinishReason
} from './chat.js';
export { contentToText } from './chat.js';

export type {
    AparteTool,
    AparteToolCall,
    AparteApprovalPolicy,
    AparteApprovalRuling,
    AparteToolResult,
    AparteToolHandler,
    AparteToolContext,
    AparteToolRenderer,
    AparteToolSummary,
    AparteToolInputFormatter,
    AparteToolMatcher,
    AparteToolDisplay,
    AparteToolDetails,
    AparteToolCallView,
    AparteMountedView,
    AparteToolMount,
    AparteToolApprovalRequestDetail,
} from './tools.js';

// ─────────────────────────────────────────────────────────────────────────────
// Errors - Standard error codes and classes
// ─────────────────────────────────────────────────────────────────────────────

export { AparteErrorCode, AparteError } from './errors.js';

export type {
    AparteModelChangeEventDetail,
    AparteApprovalModeChangeEventDetail,
    AparteMessageDoneEventDetail,
    AparteMessageStartEventDetail,
    AparteMessageErrorEventDetail,
    AparteMessageAbortedEventDetail,
    AparteMessagePausedEventDetail,
    AparteMessageResumedEventDetail,
    AparteAbortEventDetail,
    AparteCompactEventDetail,
    AparteCompactDoneEventDetail,
    AparteCompactStartEventDetail,
    AparteCompactErrorEventDetail,
    AparteAttachmentPreviewEventDetail,
    AparteMessageInfoEventDetail,
} from './events.js';

// The attribute surface of every element, for the framework wrappers to map over.
// Types only — no runtime, so both barrels carry them and check:node-barrel-types is
// satisfied by construction.
export type {
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
    AparteContextAttributes,
    AparteIconAttributes,
    AparteScrollRailAttributes,
    AparteSidebarAttributes,
    AparteSplitAttributes,
    AparteLauncherAttributes,
    AparteSuggestionsAttributes
} from './element-attributes.js';

// The canonical imperative surface every framework <AparteChat> exposes.
export type { AparteChatImperativeApi, AparteUiHandle } from './imperative-api.js';

