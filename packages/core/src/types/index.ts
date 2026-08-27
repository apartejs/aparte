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
    AparteMessageBranch,
    AparteBubbleActionsConfig,
    AparteBubbleActionName,
    AparteViewportConfig,
    AparteInputConfig
} from './models.js';

// ─────────────────────────────────────────────────────────────────────────────
// Events - Component communication
// ─────────────────────────────────────────────────────────────────────────────

export type {
    AparteSendEventDetail,
    AparteSiblingInfo,
    AparteBranchNavigateEventDetail,
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
    AparteThinkingSegment,
    AparteCodeSegment,
    AparteErrorSegment,
    ApartePipelineWaitingSegment,
    AparteSegment,
    AparteCustomSegment,
    AparteToolCallSegment,
    AparteArtifactSegment,
    AparteSegmentType,
    AparteSegmentRenderer,
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
    AparteAIProviderConfigField,
    AparteAIProviderConfigSchema,
    AparteModelConfig,
    ModelStatus,
    ModelLoadProgress
} from './model-provider.js';

export type {
    AparteChatRequest,
    AparteChatResponse,
    AparteChatMessage,
    AparteContentPart,
    AparteTextPart,
    AparteImagePart,
    AparteFilePart,
    AparteStreamEvent,
    AparteStreamEventMap,
    AparteUsage
} from './chat.js';
export { contentToText } from './chat.js';

export type {
    AparteTool,
    AparteToolCall,
    AparteToolResult,
    AparteToolHandler,
    AparteToolContext,
    AparteToolRenderer,
    AparteToolApprovalRequestDetail,
} from './tools.js';

// ─────────────────────────────────────────────────────────────────────────────
// Errors - Standard error codes and classes
// ─────────────────────────────────────────────────────────────────────────────

export { AparteErrorCode, AparteError } from './errors.js';

export type {
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
    AparteArtifactStartEventDetail,
    AparteArtifactDeltaEventDetail,
    AparteArtifactReadyEventDetail,
    AparteArtifactRedownloadEventDetail
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
    AparteProgressSpinnerAttributes
} from './element-attributes.js';

// The canonical imperative surface every framework <AparteChat> exposes.
export type { AparteChatImperativeApi } from './imperative-api.js';

