/**
 * Public types for the React wrapper — all re-exported from `@aparte/core`, the
 * single source of truth. `AparteSendEventDetail` used to be re-declared here
 * WITHOUT `targetId`, which the composer actually sends (multi-instance scoping);
 * re-export the canonical one so the field isn't silently dropped from the type.
 */
export type {
    AparteMessage,
    AparteSegment,
    AparteTextSegment,
    AparteCodeSegment,
    AparteThinkingSegment,
    AparteTerminalSegment,
    AparteSendEventDetail,
    AparteActionEventDetail,
} from '@aparte/core';
