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
    AparteTextSegment,
    AparteThinkingSegment,
    AparteCodeSegment,
    AparteDiffSegment,
    AparteDiffHunk,
    AparteDiffLine,
    AparteTerminalSegment,
    AparteFileTreeSegment,
    AparteFileNode,
    AparteImageSegment,
    ApartePreviewSegment,
    AparteErrorSegment,
    AparteProgressSegment,
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
    AparteToolDecisionDetail,
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
    AparteTerminalRunEventDetail,
    AparteFileGenReadyEventDetail,
    AparteFileGenErrorEventDetail,
    AparteMessageInfoEventDetail,
    AparteArtifactStartEventDetail,
    AparteArtifactDeltaEventDetail,
    AparteArtifactReadyEventDetail,
    AparteArtifactRedownloadEventDetail
} from './events.js';

// The canonical imperative surface every framework <AparteChat> exposes.
export type { AparteChatImperativeApi } from './imperative-api.js';

