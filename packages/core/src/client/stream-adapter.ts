/**
 * stream-adapter.ts — the DOM half of the structured-stream agent loop.
 *
 * `@aparte/engine`'s `runStreamAgent` is the headless loop: it emits high-level,
 * DOM-free run events. This adapter is the other half — it turns each event into
 * the exact `targetElement.*` calls + CustomEvents that `AparteClient._streamLoop`
 * performs today, using the **real** `AparteStreamParser` and tool renderers. So
 * `runStreamAgent` (engine, pure Node) + this adapter (core, DOM) reproduce
 * `_streamLoop` byte-for-byte.
 *
 * DEPENDENCY DIRECTION: `@aparte/core` is the zero-dep leaf — it must NEVER import
 * `@aparte/engine` (engine peer-deps core; importing back would create a build
 * cycle). So the run-event contract is **mirrored** here as
 * {@link AparteStreamRunEvent}, structurally identical to engine's `StreamRunEvent`.
 * `@aparte/engine`'s `runStreamAgent` emits objects that satisfy this type; a
 * consumer wires the two together via the injectable
 * `AparteClientOptions.streamRunner` seam — the same pattern as `approvalResolver`
 * (HITL) and `compactionSelector`. Keep the two unions in sync by hand.
 */

import { AparteStreamParser } from '../parsers/aparte-stream-parser.js';
import type { AparteConfigClass } from '../config/aparte-config.js';
import type { AparteSegment, AparteMessage, AparteStreamEvent } from '../types/index.js';
import type {
    AparteThinkingSegment,
    AparteToolCallSegment,
    AparteArtifactSegment,
    AparteCodeSegment,
} from '../types/segments.js';
import type { AparteUsage, AparteChatRequest } from '../types/chat.js';

/**
 * DOM-free run events emitted by `@aparte/engine`'s `runStreamAgent`, mirrored here
 * so core need not import engine. **Structurally identical** to engine's
 * `StreamRunEvent` — kept in sync manually (the boundary cost of the zero-dep
 * leaf). See `packages/engine/src/agent/stream-events.ts` for the source of truth
 * and the per-event `_streamLoop` mapping notes.
 */
export type AparteStreamRunEvent =
    | { type: 'run-start' }
    | { type: 'turn-start' }
    | { type: 'text-delta'; delta: string; reduced?: boolean }
    | { type: 'text-flush' }
    | { type: 'thinking-delta'; delta: string }
    | { type: 'artifact-open'; id: string; mimeType: string; kind: string; title: string }
    | { type: 'artifact-chunk'; id: string; content: string }
    | { type: 'artifact-close'; id: string; content: string; inline: boolean }
    | { type: 'artifact-ready'; id: string; mimeType: string; kind: string; title: string; content: string }
    | { type: 'tool-start'; toolCallId: string; name: string; input: unknown }
    | { type: 'tool-awaiting-approval'; toolCallId: string; name: string; input: unknown }
    | { type: 'tool-approved'; toolCallId: string }
    | { type: 'tool-rejected'; toolCallId: string; reason: string }
    | { type: 'tool-resolved'; toolCallId: string; result: string }
    | { type: 'tool-aborted'; toolCallId: string }
    | { type: 'turn-limit-exceeded'; scope: 'global' | 'tool'; limit: number; toolCallId?: string }
    | { type: 'phase-advance'; index: number }
    | { type: 'run-aborted' }
    | { type: 'run-done'; usage?: AparteUsage };

/** Synchronous, ordered event sink — mirrors engine's `StreamRunEmitter`. */
export type AparteStreamRunEmitter = (event: AparteStreamRunEvent) => void;

/**
 * Options for an injected {@link AparteStreamRunner} — structurally identical to
 * engine's `StreamRunOptions` (the mirror boundary again). `AparteClient` builds
 * these from its config/provider/transport and hands them to the runner.
 */
export interface AparteStreamRunOptions {
    messageId: string;
    baseRequest: AparteChatRequest;
    /** Calls the transport; returns the structured stream or a plain string. */
    transportCall: (request: AparteChatRequest) => Promise<AsyncIterable<AparteStreamEvent> | string>;
    /** Resolves a tool's handler by name (mirrors `AparteConfig.getToolHandler`). */
    toolLookup: (name: string) => ((call: { id: string; name: string; input: Record<string, unknown> }, signal: AbortSignal) => Promise<{ content: string }>) | undefined;
    /** Resolves a tool's loop config by name (maxTurns / needsApproval). */
    toolConfigLookup?: (name: string) => { maxTurns?: number; needsApproval?: boolean } | undefined;
    /** HITL approval resolver for `needsApproval` tools. */
    approvalResolver?: (toolCallId: string, signal: AbortSignal) => Promise<{ approved: boolean; payload?: unknown }>;
    /** The DOM adapter (from {@link createStreamAdapter}). */
    emitter: AparteStreamRunEmitter;
    /** Single abort signal (the client composes `_isAborted` + the controller). */
    signal: AbortSignal;
    maxTurns?: number;
    toolTimeoutMs?: number;
    idGen?: (prefix: string) => string;
}

/**
 * A headless structured-stream loop injected via `AparteClientOptions.streamRunner`
 * — the seam by which a consumer swaps `_streamLoop`'s inline loop for
 * `@aparte/engine`'s `runStreamAgent` (core stays the zero-dep leaf; it never
 * imports engine). Structurally identical to `runStreamAgent`; wire it with a
 * cast at the injection site if the duck-typed shapes don't line up exactly.
 */
export type AparteStreamRunner = (opts: AparteStreamRunOptions) => Promise<AparteUsage | undefined>;

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
    config: AparteConfigClass;
    /** The streamed assistant message id (carried in run/artifact events). */
    messageId: string;
    /**
     * Code-fence promotion hint (`baseRequest._meta.artifactHint`). When set, the
     * first `code` segment produced by the text parser is promoted to an artifact
     * — the one `_streamLoop` mechanism that stays adapter-side (it needs the
     * parser). Absent for the raw / XML / create_artifact modes.
     */
    artifactHint?: { mimeType: string; kind: string };
}

/** `_dispatchLifecycleEvent` (aparte-client.ts) — a bubbling/composed CustomEvent. */
function dispatchLifecycleEvent(target: StreamAdapterTarget, name: string, detail: unknown): void {
    target.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
}

/**
 * `_dispatchArtifactLifecycle` (aparte-client.ts) — fires `aparte-artifact-start`
 * once per segment id, `aparte-artifact-delta` when the body grew, and
 * `aparte-artifact-ready` when `isFinal`. `progress` tracks per-id broadcast length.
 */
function dispatchArtifactLifecycle(
    target: StreamAdapterTarget,
    messageId: string,
    segment: { id: string; content?: string; mimeType?: string; artifactType?: string; title?: string },
    progress: Map<string, number>,
    isFinal: boolean,
): void {
    const id = segment.id;
    const content = segment.content ?? '';
    const seen = progress.get(id);

    if (seen === undefined) {
        target.dispatchEvent(new CustomEvent('aparte-artifact-start', {
            bubbles: true, composed: true,
            detail: { messageId, segmentId: id, mimeType: segment.mimeType, artifactType: segment.artifactType, title: segment.title },
        }));
        progress.set(id, 0);
    }

    const lastLen = progress.get(id) ?? 0;
    if (content.length > lastLen) {
        const chunk = content.slice(lastLen);
        target.dispatchEvent(new CustomEvent('aparte-artifact-delta', {
            bubbles: true, composed: true,
            detail: { segmentId: id, chunk },
        }));
        progress.set(id, content.length);
    }

    if (isFinal) {
        target.dispatchEvent(new CustomEvent('aparte-artifact-ready', {
            bubbles: true, composed: true,
            detail: { messageId, segmentId: id, mimeType: segment.mimeType, artifactType: segment.artifactType, title: segment.title, content },
        }));
    }
}

/**
 * Build the event → DOM adapter for one streamed message. Returns a synchronous
 * {@link AparteStreamRunEmitter} to hand to `runStreamAgent` as its `emitter`.
 * Reproduces `_streamLoop`'s `targetElement.*` call sequence exactly (validated
 * by the engine parity test against the real loop).
 */
export function createStreamAdapter(opts: CreateStreamAdapterOptions): AparteStreamRunEmitter {
    const { target, config, messageId, artifactHint } = opts;

    // Per-turn streaming state (reset on `turn-start`, mirroring `_streamLoop`
    // creating a fresh parser / maps each outer iteration).
    let parser = new AparteStreamParser();
    let streaming = new Set<string>();
    let thinkingId: string | null = null;
    let thinkingContent = '';
    let thinkingCollapsed = false;
    let artifactProgress = new Map<string, number>();
    let artifactPromoted = false;
    // id → open-segment meta, so chunk/close can rebuild the full segment for the
    // artifact-lifecycle dispatch (which reads mimeType/artifactType/title).
    let artifactMeta = new Map<string, { mimeType: string; artifactType: string; title: string }>();

    return (e: AparteStreamRunEvent): void => {
        switch (e.type) {
            case 'run-start':
                target.updateMessage?.(messageId, { status: 'streaming' });
                break;

            case 'turn-start':
                parser = new AparteStreamParser();
                streaming = new Set();
                thinkingId = null;
                thinkingContent = '';
                thinkingCollapsed = false;
                artifactProgress = new Map();
                artifactPromoted = false;
                artifactMeta = new Map();
                break;

            case 'thinking-delta': {
                thinkingContent += e.delta;
                if (!thinkingId) {
                    const seg: AparteThinkingSegment = {
                        id: `think-${crypto.randomUUID()}`,
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
                    target.updateSegment?.(thinkingId, { collapsed: true });
                    thinkingCollapsed = true;
                }
                // Reduced pre-tag path (XML mode): render only completed segments;
                // leave the trailing active segment for the next tag-free delta
                // (mirrors _streamLoop :1300-1313). No artifact promotion here —
                // pre-tag text is plain chat.
                if (e.reduced) {
                    const r = parser.parse(e.delta);
                    for (const segment of r.segments) {
                        if (!streaming.has(segment.id)) {
                            target.addSegment?.(segment);
                            streaming.add(segment.id);
                        }
                    }
                    if (r.segments.length === 0 && !parser.getState().activeSegment) {
                        if (target.typeName) target.typeName(e.delta);
                        else target.updateLastMessage?.(e.delta, { append: true });
                    }
                    break;
                }
                const result = parser.parse(e.delta);
                for (let segment of result.segments) {
                    // Artifact-hint promotion: first code fence → artifact.
                    if (artifactHint && !artifactPromoted && segment.type === 'code') {
                        const codeSeg = segment as AparteCodeSegment;
                        const promoted: AparteArtifactSegment = {
                            id: codeSeg.id,
                            type: 'artifact',
                            mimeType: artifactHint.mimeType,
                            artifactType: artifactHint.kind,
                            title: codeSeg.filename ?? artifactHint.kind,
                            content: codeSeg.content,
                        };
                        segment = promoted;
                        artifactPromoted = true;
                    }
                    if (!streaming.has(segment.id)) {
                        target.addSegment?.(segment);
                        streaming.add(segment.id);
                    } else if ('content' in segment) {
                        target.updateSegment?.(segment.id, { content: (segment as { content: string }).content });
                    }
                    if (segment.type === 'artifact') {
                        dispatchArtifactLifecycle(target, messageId, segment as AparteArtifactSegment, artifactProgress, true);
                    }
                }
                const active = parser.getState().activeSegment;
                if (active) {
                    if (!streaming.has(active.id)) {
                        target.addSegment?.(active);
                        streaming.add(active.id);
                        if (active.type === 'artifact') {
                            dispatchArtifactLifecycle(target, messageId, active as AparteArtifactSegment, artifactProgress, false);
                        }
                    } else {
                        target.updateSegment?.(active.id, { content: (active as { content: string }).content });
                        if (active.type === 'artifact') {
                            dispatchArtifactLifecycle(target, messageId, active as AparteArtifactSegment, artifactProgress, false);
                        }
                    }
                } else if (result.segments.length === 0) {
                    if (target.typeName) target.typeName(e.delta);
                    else target.updateLastMessage?.(e.delta, { append: true });
                }
                break;
            }

            case 'text-flush': {
                const finals = parser.finalize();
                // Finalize-time code-fence promotion (stream ended without ```).
                if (artifactHint && !artifactPromoted) {
                    const codeIdx = finals.findIndex(s => s.type === 'code');
                    if (codeIdx !== -1) {
                        const codeSeg = finals[codeIdx] as AparteCodeSegment;
                        const promoted: AparteArtifactSegment = {
                            id: codeSeg.id,
                            type: 'artifact',
                            mimeType: artifactHint.mimeType,
                            artifactType: artifactHint.kind,
                            title: codeSeg.filename ?? artifactHint.kind,
                            content: codeSeg.content,
                        };
                        finals[codeIdx] = promoted;
                        artifactPromoted = true;
                        if (streaming.has(promoted.id)) {
                            target.updateSegment?.(promoted.id, promoted as Partial<AparteSegment>);
                        }
                    }
                }
                for (const s of finals) {
                    if (!streaming.has(s.id)) target.addSegment?.(s);
                    else if ('content' in s) target.updateSegment?.(s.id, { content: (s as { content: string }).content });
                    if (s.type === 'artifact') {
                        dispatchArtifactLifecycle(target, messageId, s as AparteArtifactSegment, artifactProgress, true);
                    }
                }
                break;
            }

            case 'artifact-open': {
                const seg: AparteArtifactSegment = {
                    id: e.id, type: 'artifact',
                    mimeType: e.mimeType, artifactType: e.kind, title: e.title,
                    content: '',
                };
                target.addSegment?.(seg);
                streaming.add(e.id);
                artifactMeta.set(e.id, { mimeType: e.mimeType, artifactType: e.kind, title: e.title });
                dispatchArtifactLifecycle(target, messageId, seg, artifactProgress, false);
                break;
            }

            case 'artifact-chunk': {
                const meta = artifactMeta.get(e.id);
                target.updateSegment?.(e.id, { content: e.content });
                dispatchArtifactLifecycle(target, messageId, { id: e.id, content: e.content, ...meta }, artifactProgress, false);
                break;
            }

            case 'artifact-close': {
                const meta = artifactMeta.get(e.id);
                target.updateSegment?.(e.id, { content: e.content, inline: e.inline } as Partial<AparteSegment>);
                dispatchArtifactLifecycle(target, messageId, { id: e.id, content: e.content, ...meta }, artifactProgress, true);
                break;
            }

            case 'artifact-ready': {
                // One-shot create_artifact: full content up-front, no open/chunk.
                const seg: AparteArtifactSegment = {
                    id: e.id, type: 'artifact',
                    mimeType: e.mimeType, artifactType: e.kind, title: e.title,
                    content: e.content,
                };
                target.addSegment?.(seg);
                dispatchArtifactLifecycle(target, messageId, seg, artifactProgress, true);
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
                    // Inject per-tool styles once into document.head.
                    if (renderer.getStyles) {
                        const styles = renderer.getStyles();
                        if (styles) {
                            const styleId = `aparte-tool-renderer-${e.name}`;
                            if (!document.getElementById(styleId)) {
                                const styleEl = document.createElement('style');
                                styleEl.id = styleId;
                                styleEl.textContent = styles;
                                document.head.appendChild(styleEl);
                            }
                        }
                    }
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
                target.updateSegment?.(`tool-${e.toolCallId}`, { status: 'resolved', result: e.result });
                break;

            case 'tool-aborted':
                target.updateSegment?.(`tool-${e.toolCallId}`, { status: 'aborted' });
                break;

            case 'turn-limit-exceeded':
                if (e.scope === 'global') {
                    target.addSegment?.({
                        id: `max-turns-${crypto.randomUUID()}`,
                        type: 'error',
                        content: `Stopped after ${e.limit} tool calls to prevent an infinite loop.`,
                        details: 'MAX_TURNS_EXCEEDED',
                    });
                } else if (e.toolCallId) {
                    target.updateSegment?.(`tool-${e.toolCallId}`, { status: 'aborted' });
                }
                break;

            case 'phase-advance':
                target.addSegment?.({ id: `pw-${crypto.randomUUID()}`, type: 'pipeline-waiting' } as AparteSegment);
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
 * Used by the `_streamLoop` seam when building `transportCall` for an injected
 * runner. Mirrors `_streamLoop`'s `reader.read()` loop + `reader.cancel()`.
 */
export function readableToAsyncIterable(
    stream: ReadableStream<AparteStreamEvent>,
    signal: AbortSignal,
): AsyncIterable<AparteStreamEvent> {
    return {
        [Symbol.asyncIterator](): AsyncIterator<AparteStreamEvent> {
            const reader = stream.getReader();
            const onAbort = () => { try { reader.cancel(); } catch { /* best effort */ } };
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
                    try { reader.releaseLock(); } catch { /* best effort */ }
                    return { done: true, value: undefined };
                },
            };
        },
    };
}
