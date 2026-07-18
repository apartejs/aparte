/**
 * Public types for the Vue wrapper — all re-exported from `@aparte/core`, the
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

/** Props of the `<AparteUi>` universal pass-through proxy. */
export interface AparteUiProps {
    /** The custom element tag name (e.g. 'aparte-model-selector'). */
    name: string;
    /** Props to apply. Keys starting with `--` become CSS variables. */
    props?: Record<string, unknown>;
    /**
     * Which custom events to forward through `elementEvent`. Defaults to the
     * interactive aparté surface (`DEFAULT_UI_EVENTS` from `@aparte/core`).
     */
    events?: string[];
}

/**
 * The imperative surface `<AparteUi>` exposes (template ref) — the same
 * `getElement`/`callMethod` contract on all four wrappers.
 */
export interface AparteUiHandle {
    getElement<T extends HTMLElement = HTMLElement>(): T | null;
    callMethod<T = unknown>(methodName: string, ...args: unknown[]): T | undefined;
}
