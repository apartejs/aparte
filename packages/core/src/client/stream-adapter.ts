/**
 * stream-adapter.ts — the DOM half of the structured-stream agent loop.
 *
 * `@aparte/engine`'s `runStreamAgent` is the headless loop: it emits high-level,
 * DOM-free run events. This adapter is the other half — it turns each event into
 * the exact `targetElement.*` calls + CustomEvents that core's inline loop
 * performed, using the **real** `AparteStreamParser` and tool renderers. So
 * `runStreamAgent` (engine, pure Node) + this adapter (core, DOM) reproduce that
 * loop byte-for-byte — and have replaced it (audit 2026-08-28, D1).
 *
 * DEPENDENCY DIRECTION: `@aparte/core` depends on `@aparte/engine` — first-party, so
 * the zero-third-party-dependency promise is untouched — never the reverse. The
 * run-event contract is engine's: {@link AparteStreamRunEvent} and its siblings below
 * are `StreamRunEvent` & co under core's names, so there is nothing to keep in sync by
 * hand any more. The hand-mirrored union this file used to carry, and the compile-time
 * guard in engine that policed it, went with the mirror (audit 2026-08-28, D1). A
 * consumer wires a runner through `AparteClientOptions.streamRunner` — the same
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
import { uuid } from '../utils/uuid.js';
import { dispatchLifecycleEvent } from './lifecycle-events.js';
import { injectToolRendererStyles } from '../renderers/segment-renderers.js';

/**
 * The DOM-free run events `@aparte/engine`'s `runStreamAgent` emits — engine's
 * `StreamRunEvent`, under core's name. See `packages/engine/src/agent/stream-events.ts`
 * for the per-event `_streamLoop` mapping notes.
 */
export type AparteStreamRunEvent = StreamRunEvent;

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
 * `runStreamAgent` IS this type — pass it, do not cast it. An earlier version of this
 * comment advised a cast "if the duck-typed shapes don't line up", which is how the
 * two packages' message types drifted apart unnoticed and shipped a
 * `streamRunner: runStreamAgent` that did not compile on five docs pages and a
 * README. The alias makes that drift a typecheck error in the composition itself.
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
}

/**
 * Build the event → DOM adapter for one streamed message. Returns a synchronous
 * {@link AparteStreamRunEmitter} to hand to `runStreamAgent` as its `emitter`.
 * Reproduces the inline loop's `targetElement.*` call sequence exactly (validated
 * by the engine parity test against the real loop).
 */
export function createStreamAdapter(opts: CreateStreamAdapterOptions): AparteStreamRunEmitter {
    const { target, config, messageId } = opts;

    // Per-turn streaming state (reset on `turn-start`, mirroring `_streamLoop`
    // creating a fresh parser / maps each outer iteration).
    let parser = new AparteStreamParser({ blocks: config.getStreamBlocks() });
    let streaming = new Set<string>();
    let thinkingId: string | null = null;
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
                    const seg: AparteThinkingSegment = {
                        id: `think-${uuid()}`,
                        type: 'thinking',
                        content: thinkingContent,
                        collapsed: true,
                        label: 'Thinking',
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
                    target.updateSegment?.(thinkingId, { collapsed: true, isStreaming: false });
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
                const renderer = config.getToolRenderer(e.name);
                if (renderer) {
                    injectToolRendererStyles(e.name, renderer);
                    const html = renderer.render(toolSeg);
                    if (html) target.addSegment?.(toolSeg);
                } else {
                    target.addSegment?.(toolSeg);
                }
                break;
            }

            case 'tool-awaiting-approval':
                target.updateSegment?.(`tool-${e.toolCallId}`, { status: 'awaiting-approval' });
                dispatchLifecycleEvent(target, 'aparte-tool-approval-request', { toolCallId: e.toolCallId, toolName: e.name, input: e.input });
                break;

            case 'tool-approved':
                target.updateSegment?.(`tool-${e.toolCallId}`, { status: 'pending' });
                break;

            case 'tool-rejected':
                target.updateSegment?.(`tool-${e.toolCallId}`, { status: 'rejected', result: e.reason });
                break;

            case 'tool-resolved':
                target.updateSegment?.(`tool-${e.toolCallId}`, {
                    status: 'resolved',
                    result: e.result,
                    ...(e.structuredResult !== undefined ? { structuredResult: e.structuredResult } : {}),
                });
                break;

            case 'tool-aborted':
                target.updateSegment?.(`tool-${e.toolCallId}`, { status: 'aborted' });
                break;

            case 'tool-failed':
                // The handler threw: the row settles on the crash's one line, and the run
                // ends on the same error (the message's error card follows).
                target.updateSegment?.(`tool-${e.toolCallId}`, { status: 'failed', result: e.error });
                break;

            case 'turn-limit-exceeded':
                if (e.scope === 'global') {
                    target.addSegment?.({
                        id: `max-turns-${uuid()}`,
                        type: 'error',
                        content: `Stopped after ${e.limit} tool calls to prevent an infinite loop.`,
                        details: 'MAX_TURNS_EXCEEDED',
                    });
                } else if (e.toolCallId) {
                    target.updateSegment?.(`tool-${e.toolCallId}`, { status: 'aborted' });
                }
                break;


            case 'run-aborted':
                dispatchLifecycleEvent(target, 'aparte-message-aborted', { messageId });
                break;

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
            const onAbort = () => { try { void reader.cancel(); } catch { /* best effort */ } };
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
