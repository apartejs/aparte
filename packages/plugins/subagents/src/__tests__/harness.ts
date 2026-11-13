/**
 * A real chat for the plugin's tests: a host element (the chat), a real
 * `<aparte-chat-viewport>` in it holding a user message and the reply `a1`, and core's real
 * stream adapter writing the reply — the pieces a client drives, without a model.
 */
import {
    aparteGlobalConfig,
    attachConfig,
    createStreamAdapter,
    registerDefaultRenderers,
    type AparteConfig,
    type AparteMessage,
    type AparteSegment,
    type AparteStreamRunEmitter,
    type AparteStreamRunEvent,
    type AparteToolCallSegment,
    type StreamAdapterTarget,
} from '@aparte/core';

export type Viewport = HTMLElement & StreamAdapterTarget & {
    appendMessage(message: AparteMessage, options?: { historical?: boolean }): void;
    getMessage(id: string): AparteMessage | undefined;
    getMessages(): AparteMessage[];
};

export interface Chat {
    host: HTMLElement;
    viewport: Viewport;
    /** The reply's adapter. `again()` makes a second one, as a resumed run does. */
    emit: AparteStreamRunEmitter;
    again(): AparteStreamRunEmitter;
    /** Emit each event, in order. */
    run(...events: AparteStreamRunEvent[]): void;
    segments(): AparteSegment[];
    segment(id: string): AparteSegment | undefined;
    row(id: string): HTMLElement | null;
}

/**
 * A chat on the page, its reply `a1` open, with its own config when one is given. `messages`
 * are a saved conversation, handed back as history (`appendMessage(…, { historical: true })`).
 */
export function chat(opts: { config?: AparteConfig; messages?: AparteMessage[]; id?: string } = {}): Chat {
    registerDefaultRenderers();
    const config = opts.config ?? aparteGlobalConfig;
    const host = document.createElement('div');
    host.id = opts.id ?? 'chat-1';
    const viewport = document.createElement('aparte-chat-viewport') as Viewport;
    host.append(viewport);
    document.body.append(host);
    if (opts.config) {
        attachConfig(host, opts.config);
        registerDefaultRenderers(opts.config);
    }
    if (opts.messages) {
        for (const message of opts.messages) viewport.appendMessage(message, { historical: true });
    } else {
        viewport.appendMessage({ id: 'u1', role: 'user', content: 'Go', timestamp: 1 });
        viewport.appendMessage({ id: 'a1', role: 'assistant', content: '', timestamp: 2, status: 'pending' } as AparteMessage);
    }
    const again = (): AparteStreamRunEmitter => createStreamAdapter({ target: viewport, config, messageId: 'a1', targetId: host.id });
    const emit = again();
    const segments = (): AparteSegment[] => viewport.getMessage('a1')?.segments ?? [];
    return {
        host,
        viewport,
        emit,
        again,
        run: (...events) => { for (const e of events) emit(e); },
        segments,
        segment: (id) => segments().find((s) => s.id === id),
        row: (id) => host.querySelector<HTMLElement>(`[data-segment-id="${id}"]`),
    };
}

/** The same events, as the sub-agent `agentId`'s. */
export const as = (agentId: string, ...events: AparteStreamRunEvent[]): AparteStreamRunEvent[] =>
    events.map((e) => ({ ...e, agentId }) as AparteStreamRunEvent);

/** The visible text of a part of a tool row (`name`, `target`, `activity`, `note`, `state`), `null` when hidden. */
export function shown(row: Element | null, part: string): string | null {
    const el = row?.querySelector<HTMLElement>(`.aparte-tool-${part}`);
    if (!el || el.hidden) return null;
    return el.textContent;
}

/** A frame and then some: what the coalesced writes wait for. */
export const frame = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 40));

/** The call segment `tool-<id>` of a list. */
export const callIn = (segments: readonly AparteSegment[], toolCallId: string): AparteToolCallSegment | undefined =>
    segments.find((s) => s.id === `tool-${toolCallId}`) as AparteToolCallSegment | undefined;

/** Everything a segment list says, as text: to look for a word in it. */
export const textOfAll = (segments: readonly AparteSegment[]): string =>
    segments.map((s) => (s as { content?: unknown }).content).filter((c): c is string => typeof c === 'string' && c !== '').join(' ');
