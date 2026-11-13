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
import { aparteGlobalConfig, type AparteConfig, type AparteRunEventObserver, type AparteRunEventContext } from '../config/aparte-config.js';
import type { AparteSegment, AparteMessage, AparteStreamEvent, AparteSource, AparteCitation } from '../types/index.js';
import type {
    AparteActivitySegment,
    AparteThinkingSegment,
    AparteToolCallSegment,
} from '../types/segments.js';
import type { AparteUsage } from '../types/chat.js';
import type { StreamRunEvent, StreamRunEmitter, StreamRunOptions, StreamUsage } from '@aparte/engine';
import { toolRefusal as engineToolRefusal, runSubAgent as engineRunSubAgent, startSubAgent as engineStartSubAgent } from '@aparte/engine';
import { uuid } from '../utils/uuid.js';
import { AparteErrorCode } from '../types/errors.js';
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

/**
 * Run a sub-agent from inside a tool handler — engine's `runSubAgent`, under core's roof.
 * `run` is the handler's `context.run`, `signal` its second argument; `request` is the
 * sub-agent's own conversation. Its events reach the page as the sub-agent's: kept out of
 * the reply, and handed to the observers of {@link AparteConfig.observeRunEvents}.
 *
 * Resolves `{ status, text }` and never rejects for a sub-agent that failed, so the tool
 * decides what the model reads. A handler called without a run (a browser tool answering
 * a paused server run) has nothing to open one from, and rejects with a clear error.
 *
 * @example
 * aparteGlobalConfig.registerTool(researchTool, async (call, signal, context) => {
 *   const child = await runSubAgent(context!.run!, {
 *     name: 'researcher',
 *     request: { modelId: 'your-model', messages: [{ role: 'user', content: String(call.input['task']) }] },
 *   }, signal);
 *   return { toolCallId: call.id, content: child.text };
 * });
 */
export const runSubAgent: typeof engineRunSubAgent = engineRunSubAgent;

/**
 * Start a sub-agent in the background, from inside a tool handler — engine's `startSubAgent`.
 * The handler answers at once and the model goes on, writing and calling tools, while the
 * sub-agent works on its own line; the reply does not end before it is back. Once the model
 * has nothing more to say, the loop waits for the sub-agents still at work, tells the model
 * how each ended, and asks it again. A Stop, a pause of the run, the turn limit or a crash
 * stop it.
 *
 * @example
 * aparteGlobalConfig.registerTool(researchTool, async (call, _signal, context) => {
 *   startSubAgent(context!.run!, {
 *     name: 'researcher',
 *     request: { modelId: 'your-model', messages: [{ role: 'user', content: String(call.input['task']) }] },
 *   });
 *   return { toolCallId: call.id, content: 'The researcher is on it; its answer comes back to you.' };
 * });
 */
export const startSubAgent: typeof engineStartSubAgent = engineStartSubAgent;

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
    /**
     * The step the reply is on, live: its name while one is open (the latest one opened),
     * `null` once none is. Told only when it changes, and `null` when the run ends. Never
     * stored — a target that shows nothing of it leaves it out.
     */
    setStep?(id: string, name: string | null): void;
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
    /**
     * Whether the events this adapter is fed go to the observers of
     * {@link AparteConfig.observeRunEvents}. On by default: an adapter writing a reply is how
     * its run is heard. Pass `false` for an adapter fed events an observer handed you — a
     * sub-agent's, written into its own segment list: they reached every observer already,
     * from the reply's adapter, and a second copy without its `agentId` reads as the reply's.
     *
     * @example
     * // A sub-agent's conversation, written apart from the reply, heard once by the app.
     * const lane = createStreamAdapter({ target: createSegmentList({ messageId }), config, messageId, observe: false });
     */
    observe?: boolean;
}

/**
 * Build the event → DOM adapter for one streamed message. Returns a synchronous
 * {@link AparteStreamRunEmitter} to hand to `runStreamAgent` as its `emitter`.
 * Reproduces the inline loop's `targetElement.*` call sequence exactly (validated
 * by the engine parity test against the real loop).
 */
export function createStreamAdapter(opts: CreateStreamAdapterOptions): AparteStreamRunEmitter {
    const { target, config, messageId, targetId, observe: notify = true } = opts;

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

    // What this model call streamed — its text, the segments the parser cut it into, in
    // order, and the sources it cited — to place each citation in the text segment it falls
    // in (see `placeSources`).
    let callText = '';
    let callTexts = new Map<string, { text: boolean; content: string }>();
    let callSources: AparteSource[] = [];
    let callCitations: AparteCitation[] = [];
    // The segments given a list last time: a later placement that moves it takes it back.
    let given = new Set<string>();
    // Every segment with a body counts, a code block or a reasoning block as much as text:
    // finding the next text segment from the end of the one before would search through it.
    const noteText = (segment: AparteSegment): void => {
        const content = (segment as { content?: unknown }).content;
        if (typeof content === 'string') callTexts.set(segment.id, { text: segment.type === 'text', content });
    };

    /**
     * Give each text segment the sources it cites. A provider's offsets are into the text the
     * call streamed; the parser cut that text at fences and blocks, so each segment is found
     * in it in order, and a citation goes to the segment its end falls in, rebased onto that
     * segment's `content`. A source no placed citation names — the AI SDK's carry no
     * position, and a passage in a code block gets no chip — joins the last text segment's
     * list, where it is shown without a chip.
     */
    const placeSources = (): void => {
        if (callSources.length === 0) return;
        let cursor = 0;
        const spans = [...callTexts].map(([id, { text, content }]) => {
            const start = callText.indexOf(content, cursor);
            if (start >= 0) cursor = start + content.length;
            return { id, text, start, length: content.length, citations: [] as AparteCitation[] };
        }).filter((s) => s.text);
        if (spans.length === 0) return;
        const placed = new Set<string>();
        for (const citation of callCitations) {
            // An end exactly where a segment starts closes nothing in it.
            const span = spans.find((s) => s.start >= 0 && citation.end > s.start && citation.end <= s.start + s.length);
            if (!span) continue;
            const end = citation.end - span.start;
            const start = citation.start === undefined ? undefined : Math.max(0, Math.min(end, citation.start - span.start));
            span.citations.push({ ...citation, end, ...(start === undefined ? {} : { start }) });
            for (const id of citation.sources) placed.add(id);
        }
        const last = spans[spans.length - 1]!;
        const now = new Set<string>();
        for (const span of spans) {
            const named = new Set(span.citations.flatMap((c) => c.sources));
            const sources = callSources.filter((s) => named.has(s.id) || (span === last && !placed.has(s.id)));
            if (sources.length === 0) {
                if (given.has(span.id)) target.updateSegment?.(span.id, { sources: undefined, citations: undefined } as Partial<AparteSegment>);
                continue;
            }
            now.add(span.id);
            target.updateSegment?.(span.id, { sources, citations: span.citations } as Partial<AparteSegment>);
        }
        given = now;
    };

    /**
     * The reasoning block has ended: the model moved on, to its answer or to a tool call.
     *
     * Reasoning arrived on its OWN channel (`reasoning_content`), so it never passes through
     * the parser and has no closing delimiter. Its end in band is exactly this: the provider
     * started sending answer text, or a call, so it has stopped sending reasoning. Saying
     * `isStreaming: false` here is what lets a UI show the block's duration, and stop its
     * shimmer, WHILE the answer streams or the tool runs, instead of holding "Thinking" on
     * screen until the turn ends. `endedAt` is unaffected — it was frozen by the last
     * reasoning delta. Folded unless the app keeps reasoning open (`setSegmentDefaults`) —
     * read from the CHAT's config, the one that opened the block on insert: a client on the
     * global config also answers a chat with its own, and reading the client's here snapped
     * an open block shut at the first answer token. Once per block.
     *
     * `fold` only at the answer: a tool call or a new step settles the block without
     * closing one the reader opened to watch it — the answer is the moment it gives way.
     */
    const settleThinking = (fold: boolean): void => {
        if (!thinkingId || thinkingCollapsed) return;
        const chatConfig = typeof Element !== 'undefined' && target instanceof Element ? resolveConfig(target) : config;
        const keepOpen = !fold || chatConfig.getSegmentDefaults('thinking')?.collapsed === false;
        target.updateSegment?.(thinkingId, keepOpen ? { isStreaming: false } : { collapsed: true, isStreaming: false });
        thinkingCollapsed = true;
    };

    // The reply's steps still open, in the order they opened: the latest shows, and when it
    // ends the one before it shows again. Live only — nothing of it reaches the message.
    const steps: string[] = [];
    let shownStep: string | null = null;
    const showStep = (): void => {
        const next = steps.at(-1) ?? null;
        if (next === shownStep) return;
        shownStep = next;
        target.setStep?.(messageId, next);
    };
    const endSteps = (): void => {
        steps.length = 0;
        showStep();
    };

    /** The text the parser holds is final: written, and the sources placed again over it. */
    const flushText = (): void => {
        const finals = parser.finalize();
        for (const s of finals) {
            noteText(s);
            if (!streaming.has(s.id)) target.addSegment?.(s);
            else if ('content' in s) target.updateSegment?.(s.id, segmentContentUpdate(s));
        }
        // The segments are final now: place again what came before them.
        placeSources();
    };

    // The reply's activities, by segment id, for the whole run: a later event with the same id
    // updates the segment the first one placed.
    const activities = new Set<string>();

    const handle = (e: AparteStreamRunEvent): void => {
        switch (e.type) {
            case 'step-start':
                steps.push(e.name);
                showStep();
                break;

            case 'step-end': {
                const at = steps.lastIndexOf(e.name);
                if (at >= 0) steps.splice(at, 1);
                showStep();
                break;
            }

            case 'run-start':
                target.updateMessage?.(messageId, { status: 'streaming' });
                break;

            case 'turn-start':
                // A step that was reasoning only (an AG-UI run that finished on it) ends here.
                settleThinking(false);
                parser = new AparteStreamParser({ blocks: config.getStreamBlocks() });
                streaming = new Set();
                callText = '';
                callTexts = new Map();
                // Sources a call had no text segment to give to (it streamed only a code
                // block, or only a tool call) wait for the reply's next text, listed without
                // a chip: their offsets were into that call's text. Renamed, because the
                // next call numbers its own sources from the same `s1`.
                callSources = given.size === 0 ? callSources.map((s) => ({ ...s, id: `${s.id}~` })) : [];
                callCitations = [];
                given = new Set();
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
                    // `isStreaming: true`: the block is arriving, which is what a renderer reads
                    // for it (the label's shimmer). It was left unset and only ever written
                    // `false`, so "still arriving" was never true on this path.
                    const seg: AparteThinkingSegment = {
                        id: `think-${uuid()}`,
                        type: 'thinking',
                        content: thinkingContent,
                        isStreaming: true,
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
                settleThinking(true);
                callText += e.delta;
                const result = parser.parse(e.delta);
                for (const segment of result.segments) {
                    noteText(segment);
                    if (!streaming.has(segment.id)) {
                        target.addSegment?.(segment);
                        streaming.add(segment.id);
                    } else if ('content' in segment) {
                        target.updateSegment?.(segment.id, segmentContentUpdate(segment));
                    }
                }
                const active = parser.getState().activeSegment;
                if (active) {
                    noteText(active);
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

            case 'text-flush':
                flushText();
                break;

            case 'activity': {
                const id = `activity-${e.id}`;
                if (activities.has(id)) {
                    // The same activity again, whole: its segment changes in place, never a second one.
                    target.updateSegment?.(id, { activityType: e.activityType, content: e.content } as Partial<AparteSegment>);
                    break;
                }
                activities.add(id);
                // Where it first arrived: the text before it ends there, and what follows is
                // written after it, as around a tool call.
                flushText();
                const segment: AparteActivitySegment = { id, type: 'activity', activityId: e.id, activityType: e.activityType, content: e.content };
                target.addSegment?.(segment);
                break;
            }

            case 'sources': {
                // A source sent again is the same one, completed; a citation sent again is not a second one.
                const byId = new Map(callSources.map((s) => [s.id, s]));
                for (const s of Array.isArray(e.sources) ? e.sources : []) byId.set(s.id, { ...byId.get(s.id), ...s });
                callSources = [...byId.values()];
                const seen = new Set(callCitations.map((c) => JSON.stringify([c.start, c.end, c.marker, c.sources])));
                for (const c of Array.isArray(e.citations) ? e.citations : []) {
                    const key = JSON.stringify([c.start, c.end, c.marker, c.sources]);
                    if (!seen.has(key)) { seen.add(key); callCitations.push(c); }
                }
                placeSources();
                break;
            }

            case 'tool-start': {
                // A call ends the reasoning before it, as answer text does.
                settleThinking(false);
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
                        // The CHAT's text, in its language — resolved from the target, as the
                        // reasoning default is: a client on the global config also answers a
                        // chat with its own.
                        content: (typeof Element !== 'undefined' && target instanceof Element ? resolveConfig(target) : config)
                            .t('maxTurnsReached').replace('{n}', () => String(e.limit)),
                        code: AparteErrorCode.MAX_TURNS_EXCEEDED,
                    });
                } else if (e.toolCallId) {
                    settle(e.toolCallId, { status: 'aborted', abortCause: 'turn-limit' });
                }
                break;


            case 'run-aborted':
                endSteps();
                dispatchLifecycleEvent(target, 'aparte-message-aborted', { messageId }, targetId);
                break;

            case 'run-suspended': {
                endSteps();
                // A server loop paused: each pending call records why it waits and the
                // server's ticket (the wire adds `ticket` to this event), so the paused
                // call lives in the conversation the app saves and a reload can answer it.
                const ticket = (e as { ticket?: unknown }).ticket;
                for (const p of e.pending) {
                    // A sub-agent's call is not a row of the reply: nothing here to mark, and a
                    // row of the reply that shared its id must not take its ticket.
                    if (p.agentId != null) continue;
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
                endSteps();
                // Persisted with the message, so a reload shows a cut-off reply as cut off.
                target.updateMessage?.(messageId, {
                    status: 'completed',
                    ...(e.finishReason ? { finishReason: e.finishReason } : {}),
                });
                if (e.usage) {
                    try { target.setUsage?.(messageId, e.usage); } catch { /* target may not implement setUsage */ }
                }
                break;
        }
    };

    // The chat's config: the one its element resolves (a client on the global config also
    // answers a chat with its own), else the adapter's — read per event, as above.
    const chatConfig = (): AparteConfig =>
        (typeof Element !== 'undefined' && target instanceof Element ? resolveConfig(target) : config);
    // An observer that threw, reported once for this reply rather than once per token.
    const reported = new Set<AparteRunEventObserver>();

    /**
     * Hand the event to every observer: the chat's config's first, then the adapter's when it
     * is another (a client given `{ config }` as a settings bag, with no boundary on the page),
     * then the global's — each observer once. Says whether anyone was there.
     */
    const observe = (e: AparteStreamRunEvent, own: AparteConfig): boolean => {
        const observers = new Set<AparteRunEventObserver>();
        for (const c of new Set([own, config, aparteGlobalConfig])) {
            for (const fn of c.getRunEventObservers()) observers.add(fn);
        }
        if (observers.size === 0) return false;
        const ctx: AparteRunEventContext = { messageId, target, ...(targetId !== undefined ? { targetId } : {}), config: own };
        for (const fn of observers) {
            try {
                fn(e, ctx);
            } catch (error) {
                if (!reported.has(fn)) {
                    reported.add(fn);
                    console.error('[aparte] A run-event observer threw; the reply goes on without it. Further throws from it in this reply are not reported.', error);
                }
            }
        }
        return true;
    };

    /*
     * The router. A sub-agent's event — one that carries an `agentId`, and `agent-start` /
     * `agent-end` — never reaches the reply's own handling, observed or not: its text is not
     * the reply's, its `turn-start` must not reset the reply's parser, its calls are not the
     * reply's rows, and a run-level event it carries (a hand-written backend) does not end
     * the reply. Here, at the top of the emitter, so every adapter — the client's three, an
     * app's own — routes the same way.
     *
     * With `observe: false` no observer is called: what the adapter is fed (a sub-agent's
     * events, its `agentId` taken off) reached them already from the reply's adapter, and a
     * second, unattributed copy read as the reply's own. Its caller holds the events, so
     * nothing it is fed counts as unheard either.
     */
    return (e: AparteStreamRunEvent): void => {
        const own = chatConfig();
        const observed = !notify || observe(e, own);
        const agentId = (e as { agentId?: unknown }).agentId;
        if (agentId == null && e.type !== 'agent-start' && e.type !== 'agent-end') {
            handle(e);
            return;
        }
        if (!observed && !warnedConfigs.has(own)) {
            warnedConfigs.add(own);
            console.warn(
                `[aparte] A sub-agent's events arrived (agent "${String(agentId)}") and nothing draws them: `
                + 'they are kept out of the reply and not shown. Add @aparte/plugin-subagents (setupSubagents()) '
                + 'to show one line per sub-agent, or hear them with config.observeRunEvents().',
            );
        }
        // Somebody must still be asked: an app that presents decisions itself listens for
        // this. The one event the router answers itself — the reply has no row for the call.
        if (e.type === 'tool-awaiting-approval') {
            dispatchLifecycleEvent(target, 'aparte-tool-approval-request', { toolCallId: e.toolCallId, toolName: e.name, input: e.input, agentId }, targetId);
        }
    };
}

/** The configs already told that a sub-agent's events went undrawn: once each. */
const warnedConfigs = new WeakSet<AparteConfig>();

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
