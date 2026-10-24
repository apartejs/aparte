/**
 * stream-adapter.ts — the DOM half of the structured-stream agent loop.
 *
 * `@aparte/engine`'s `runStreamAgent` is the headless loop: it emits high-level,
 * DOM-free run events. This adapter is the other half — it turns each event into
 * the `targetElement.*` calls + CustomEvents the transcript needs, using the
 * **real** `AparteStreamParser` and tool renderers. `runStreamAgent` (engine, pure
 * Node) + this adapter (core, DOM) are the one agent loop `AparteClient` runs.
 *
 * DEPENDENCY DIRECTION: `@aparte/core` depends on `@aparte/engine` — first-party, so
 * the zero-third-party-dependency promise is untouched — never the reverse. The
 * run-event contract is engine's: {@link AparteStreamRunEvent} and its siblings below
 * are `StreamRunEvent` & co under core's names, so there is nothing to keep in sync by
 * hand. A consumer wires a runner through `AparteClientOptions.streamRunner` — the same
 * pattern as `approvalResolver` (HITL).
 */

import { AparteStreamParser } from '../parsers/aparte-stream-parser.js';
import { segmentContentUpdate } from '../utils/segments.js';
import type { AparteConfig } from '../config/aparte-config.js';
import type { AparteSegment, AparteMessage, AparteStreamEvent } from '../types/index.js';
import type {
    AparteThinkingSegment,
    AparteToolCallSegment,
} from '../types/segments.js';
import type { AparteUsage } from '../types/chat.js';
import type { StreamRunEvent, StreamRunEmitter, StreamRunOptions, StreamUsage } from '@aparte/engine';
import { toolRefusal as engineToolRefusal } from '@aparte/engine';
import { uuid } from '../utils/uuid.js';
import { resolveConfig } from '../config/config-context.js';
import { dispatchLifecycleEvent } from './lifecycle-events.js';
import { injectToolRendererStyles } from '../renderers/segment-renderers.js';

/**
 * The DOM-free run events `@aparte/engine`'s `runStreamAgent` emits — engine's
 * `StreamRunEvent`, under core's name. See `packages/engine/src/agent/stream-events.ts`
 * for the per-event documentation.
 */
export type AparteStreamRunEvent = StreamRunEvent;

/**
 * What a refused tool call tells the model, and who refused it — engine's `toolRefusal`,
 * under core's roof. `reason` is the sentence the model reads (the refuser's own, else
 * the person's words quoted, else "Tool execution was rejected by the user."); `by` and
 * `instruction` are what a row shows the person.
 *
 * For a runner that answers an agent the loop does not run (an AG-UI agent, a server):
 * it writes the sentence the loop writes, so the model reads one refusal however it ran.
 *
 * @example
 * toolRefusal({ instruction: 'use the staging bucket' });
 * // → { reason: 'The user rejected this tool call and said: use the staging bucket',
 * //     by: 'person', instruction: 'use the staging bucket' }
 */
export const toolRefusal: typeof engineToolRefusal = engineToolRefusal;

/** Synchronous, ordered event sink — engine's `StreamRunEmitter`. */
export type AparteStreamRunEmitter = StreamRunEmitter;

/**
 * Options for an injected {@link AparteStreamRunner} — engine's `StreamRunOptions`.
 * `AparteClient` builds these from its config / provider / transport and hands them
 * to the runner; core's request, message and tool types are assignable to the
 * structural ones the engine declares, and that assignment is checked where it is
 * made rather than in a guard beside it.
 */
export type AparteStreamRunOptions = StreamRunOptions;

/**
 * A headless structured-stream loop injected via `AparteClientOptions.streamRunner`
 * — the seam by which a host wraps or replaces the loop `AparteClient` runs,
 * which is `@aparte/engine`'s `runStreamAgent` by default.
 *
 * `runStreamAgent` IS this type — pass it, do not cast it. The alias makes any drift
 * between the two packages' message types a typecheck error in the composition itself.
 */
export type AparteStreamRunner = (opts: AparteStreamRunOptions) => Promise<StreamUsage | undefined>;

/**
 * The imperative surface the adapter drives (subset of `AparteChatTargetElement`).
 * Every method is optional so a partial/mock target degrades gracefully.
 */
export interface StreamAdapterTarget {
    updateMessage?(id: string, updates: Partial<AparteMessage>): void;
    updateLastMessage?(content: string, options?: { append?: boolean }): void;
    addSegment?(segment: AparteSegment): void;
    updateSegment?(segmentId: string, updates: Partial<AparteSegment>): void;
    typeName?(text: string): void;
    setUsage?(id: string, usage: AparteUsage): void;
    dispatchEvent(event: Event): boolean;
}

export interface CreateStreamAdapterOptions {
    /** The chat target element the events are rendered onto. */
    target: StreamAdapterTarget;
    /** Config for tool-renderer lookup + per-tool style injection. */
    config: AparteConfig;
    /** The streamed assistant message id (carried in the run events). */
    messageId: string;
    /**
     * The id of the CHAT the target belongs to, stamped on every lifecycle event the
     * adapter dispatches. The target is whatever renders — a shell's `.viewport`,
     * which has no id of its own — so it cannot be read off the target, and an
     * unstamped event is read as "for every chat on the page". Omitted, the dispatcher
     * falls back to `target.id`, which is right for the viewport-only chat shape.
     */
    targetId?: string;
}

/**
 * Build the event → DOM adapter for one streamed message. Returns a synchronous
 * {@link AparteStreamRunEmitter} to hand to `runStreamAgent` as its `emitter`.
 * Reproduces the inline loop's `targetElement.*` call sequence exactly (validated
 * by the engine parity test against the real loop).
 */
export function createStreamAdapter(opts: CreateStreamAdapterOptions): AparteStreamRunEmitter {
    const { target, config, messageId, targetId } = opts;

    // Per-turn streaming state (reset on `turn-start`, mirroring `_streamLoop`
    // creating a fresh parser / maps each outer iteration).
    let parser = new AparteStreamParser({ blocks: config.getStreamBlocks() });
    let streaming = new Set<string>();
    let thinkingId: string | null = null;
    // Each call's segment as `tool-start` built it: a call this run did not start is one a
    // paused run left (see `settle`).
    const toolSegments = new Map<string, AparteToolCallSegment>();
    // A call this run never started is one a paused run left — a resume replays no
    // `tool-start`. Settling it ends the pause, so its row drops `deferred`, and the
    // server's ticket with it: a saved conversation keeps no answered call "paused".
    const settle = (toolCallId: string, update: Partial<AparteToolCallSegment>): void => {
        const id = `tool-${toolCallId}`;
        target.updateSegment?.(id, (toolSegments.has(id) ? update : { ...update, deferred: undefined }) as Partial<AparteSegment>);
    };
    let thinkingContent = '';
    let thinkingCollapsed = false;

    return (e: AparteStreamRunEvent): void => {
        switch (e.type) {
            case 'run-start':
                target.updateMessage?.(messageId, { status: 'streaming' });
                break;

            case 'turn-start':
                parser = new AparteStreamParser({ blocks: config.getStreamBlocks() });
                streaming = new Set();
                thinkingId = null;
                thinkingContent = '';
                thinkingCollapsed = false;
                break;

            case 'thinking-delta': {
                thinkingContent += e.delta;
                if (!thinkingId) {
                    // No `collapsed` of its own: a field the producer sets beats the app's
                    // `setSegmentDefaults('thinking', …)`, and `true` here meant a streaming
                    // reasoning block could never arrive open. Left unset it renders closed,
                    // as before, unless the app asked for it open.
                    const seg: AparteThinkingSegment = {
                        id: `think-${uuid()}`,
                        type: 'thinking',
                        content: thinkingContent,
                    };
                    thinkingId = seg.id;
                    streaming.add(seg.id);
                    target.addSegment?.(seg);
                } else {
                    target.updateSegment?.(thinkingId, { content: thinkingContent });
                }
                break;
            }

            case 'text-delta': {
                // Collapse the thinking block when response text starts.
                if (thinkingId && !thinkingCollapsed) {
                    // Reasoning arrived on its OWN channel (`reasoning_content`),
                    // so it never passes through the parser and has no closing
                    // delimiter. Its end in band is exactly this: the provider
                    // started sending answer text, so it has stopped sending
                    // reasoning. Saying `isStreaming: false` here is what lets a UI
                    // show the block's duration WHILE the answer streams, instead of
                    // holding "Thinking" on screen until the turn ends. `endedAt` is
                    // unaffected — it was frozen by the last reasoning delta.
                    // Folded unless the app keeps reasoning open (`setSegmentDefaults`) — read
                    // from the CHAT's config, the one that opened the block on insert: a client
                    // on the global config also answers a chat with its own, and reading the
                    // client's here snapped an open block shut at the first answer token.
                    const chatConfig = typeof Element !== 'undefined' && target instanceof Element ? resolveConfig(target) : config;
                    const keepOpen = chatConfig.getSegmentDefaults('thinking')?.collapsed === false;
                    target.updateSegment?.(thinkingId, keepOpen ? { isStreaming: false } : { collapsed: true, isStreaming: false });
                    thinkingCollapsed = true;
                }
                const result = parser.parse(e.delta);
                for (const segment of result.segments) {
                    if (!streaming.has(segment.id)) {
                        target.addSegment?.(segment);
                        streaming.add(segment.id);
                    } else if ('content' in segment) {
                        target.updateSegment?.(segment.id, segmentContentUpdate(segment));
                    }
                }
                const active = parser.getState().activeSegment;
                if (active) {
                    if (!streaming.has(active.id)) {
                        target.addSegment?.(active);
                        streaming.add(active.id);
                    } else {
                        target.updateSegment?.(active.id, segmentContentUpdate(active));
                    }
                } else if (result.segments.length === 0) {
                // Nothing: see the note on the other feeder. The parser is holding
                // an ambiguous prefix, and writing it here duplicated it into
                // `message.content`, which history preferred over the segments.
                }
                break;
            }

            case 'text-flush': {
                const finals = parser.finalize();
                for (const s of finals) {
                    if (!streaming.has(s.id)) target.addSegment?.(s);
                    else if ('content' in s) target.updateSegment?.(s.id, segmentContentUpdate(s));
                }
                break;
            }

            case 'tool-start': {
                const toolSeg: AparteToolCallSegment = {
                    id: `tool-${e.toolCallId}`,
                    type: 'tool_call',
                    toolCall: { id: e.toolCallId, name: e.name, input: e.input as Record<string, unknown> },
                    status: 'pending',
                };
                toolSegments.set(toolSeg.id, toolSeg);
                const renderer = config.getToolRenderer(e.name);
                if (renderer) injectToolRendererStyles(e.name, renderer);
                // Always added, whatever it draws. A call a renderer or a display hides
                // used to be left out of the message, and the history a later turn sends
                // is rebuilt from its segments — so the model lost the call it had made,
                // and a reload drew the default row for it. Hiding is the row's business:
                // the call draws an empty placeholder (see the tool_call renderer).
                target.addSegment?.(toolSeg);
                break;
            }

            case 'tool-awaiting-approval':
                target.updateSegment?.(`tool-${e.toolCallId}`, { status: 'awaiting-approval' });
                dispatchLifecycleEvent(target, 'aparte-tool-approval-request', { toolCallId: e.toolCallId, toolName: e.name, input: e.input }, targetId);
                break;

            case 'tool-approved':
                settle(e.toolCallId, { status: 'pending' });
                break;

            case 'tool-rejected':
                settle(e.toolCallId, {
                    status: 'rejected',
                    result: e.reason,
                    ...(e.by ? { refusal: e.instruction ? { by: e.by, instruction: e.instruction } : { by: e.by } } : {}),
                });
                break;

            case 'tool-resolved':
                settle(e.toolCallId, {
                    status: 'resolved',
                    result: e.result,
                    ...(e.structuredResult !== undefined ? { structuredResult: e.structuredResult } : {}),
                });
                break;

            case 'tool-aborted':
                settle(e.toolCallId, e.cause ? { status: 'aborted', abortCause: e.cause } : { status: 'aborted' });
                break;

            case 'tool-failed':
                // The handler threw: the row settles on the crash's one line, and the run
                // ends on the same error (the message's error card follows).
                settle(e.toolCallId, { status: 'failed', result: e.error });
                break;

            case 'turn-limit-exceeded':
                if (e.scope === 'global') {
                    target.addSegment?.({
                        id: `max-turns-${uuid()}`,
                        type: 'error',
                        // The chat's text, in its language: the one string of the turn
                        // that used to bypass the locale.
                        content: config.t('maxTurnsReached').replace('{n}', () => String(e.limit)),
                        code: 'MAX_TURNS_EXCEEDED',
                    });
                } else if (e.toolCallId) {
                    settle(e.toolCallId, { status: 'aborted', abortCause: 'turn-limit' });
                }
                break;


            case 'run-aborted':
                dispatchLifecycleEvent(target, 'aparte-message-aborted', { messageId }, targetId);
                break;

            case 'run-suspended': {
                // A server loop paused: each pending call records why it waits and the
                // server's ticket (the wire adds `ticket` to this event), so the paused
                // call lives in the conversation the app saves and a reload can answer it.
                const ticket = (e as { ticket?: unknown }).ticket;
                for (const p of e.pending) {
                    const id = `tool-${p.toolCallId}`;
                    const deferred = { reason: p.reason, ...(typeof ticket === 'string' ? { ticket } : {}) };
                    // Every call is in the message — started here at `tool-start`, or by the run
                    // that paused first — so a pause is always an update of its row.
                    target.updateSegment?.(id, { deferred } as Partial<AparteSegment>);
                }
                // The RUN is over; the TURN goes on, through the run that resumes it.
                target.updateMessage?.(messageId, { status: 'completed' });
                if (e.usage) {
                    try { target.setUsage?.(messageId, e.usage); } catch { /* target may not implement setUsage */ }
                }
                // Said once the paused calls are on the reply, so whoever saves the
                // conversation saves them: a reload answers a pause only if it was kept.
                dispatchLifecycleEvent(target, 'aparte-message-paused', { messageId }, targetId);
                break;
            }

            case 'run-done':
                target.updateMessage?.(messageId, { status: 'completed' });
                if (e.usage) {
                    try { target.setUsage?.(messageId, e.usage); } catch { /* target may not implement setUsage */ }
                }
                break;
        }
    };
}

/**
 * Bridge a `ReadableStream` (what the transport returns) to the
 * `AsyncIterable<AparteStreamEvent>` `runStreamAgent` consumes, cancelling the
 * reader **synchronously** on abort so a user "stop" cuts the in-flight read.
 * Used by `AparteClient` when building `transportCall` for the
 * runner. Mirrors the inline loop's `reader.read()` loop + `reader.cancel()`.
 */
export function readableToAsyncIterable(
    stream: ReadableStream<AparteStreamEvent>,
    signal: AbortSignal,
): AsyncIterable<AparteStreamEvent> {
    return {
        [Symbol.asyncIterator](): AsyncIterator<AparteStreamEvent> {
            const reader = stream.getReader();
            // `cancel()` returns a promise, which REJECTS when the abort already errored
            // the stream (an aborted fetch errors its body first). `try` catches only a
            // synchronous throw — a released reader — so the rejection is caught too, or
            // every Stop at that moment printed an uncaught AbortError.
            const onAbort = () => {
                try { reader.cancel().catch(() => { /* best effort */ }); } catch { /* best effort */ }
            };
            if (signal.aborted) onAbort();
            else signal.addEventListener('abort', onAbort, { once: true });
            return {
                async next(): Promise<IteratorResult<AparteStreamEvent>> {
                    const { done, value } = await reader.read();
                    if (done) return { done: true, value: undefined };
                    return { done: false, value };
                },
                async return(): Promise<IteratorResult<AparteStreamEvent>> {
                    signal.removeEventListener('abort', onAbort);
                    // CANCEL, then release. Releasing a reader does not stop the
                    // source: the provider's `start()` keeps draining the vendor
                    // body, so the model kept generating (and billing) whenever the
                    // runner walked away from a turn — a rejected tool, a turn
                    // limit, a missing handler. The inline loop got this fix; this
                    // path, which the docs recommend, did not.
                    try { await reader.cancel(); } catch { /* best effort */ }
                    try { reader.releaseLock(); } catch { /* best effort */ }
                    return { done: true, value: undefined };
                },
            };
        },
    };
}
