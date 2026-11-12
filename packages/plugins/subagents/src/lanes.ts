/**
 * The lanes: each sub-agent's conversation, kept apart from the reply and saved on the
 * segment that stands for it.
 *
 * Core keeps a sub-agent's events out of the reply and hands every event of the run to the
 * observers of `observeRunEvents`. This observer gives each sub-agent a lane: a segment list
 * (`createSegmentList`) written by a stream adapter of core's own (`createStreamAdapter`), fed
 * the sub-agent's events with their `agentId` taken off, so the lane holds exactly what a
 * reply would — text, reasoning, its tool calls, stamped the same way.
 *
 * A lane lives on its ANCHOR, the segment that stands for the sub-agent: the call that opened
 * it (`tool-<toolCallId>`, in a field `subagent`), or — with no call, or for the second
 * sub-agent of one call — a `subagent` segment of the plugin's own, added to the reply. A
 * sub-agent of a sub-agent follows the same two rules inside its parent's lane. The anchor is
 * written once per animation frame while text streams, and at once for everything a person
 * must see or the conversation must keep: a new segment, a tool's state, the sub-agent's end,
 * the run's end or pause — the conversation is saved on those, so the lane is on the segment
 * before anyone saves it.
 *
 * Memory is per reply, emptied when its run ends (done, stopped, failed), kept across a pause
 * (the run resumes into the same reply), and capped.
 */
import {
    createSegmentList,
    createStreamAdapter,
    type AparteMessage,
    type AparteRunEventContext,
    type AparteSegment,
    type AparteSegmentList,
    type AparteStreamRunEmitter,
    type AparteStreamRunEvent,
    type AparteToolCallSegment,
    type StreamAdapterTarget,
} from '@aparte/core';
import { subagentOf } from './status.js';
import {
    SUBAGENT_SEGMENT_TYPE,
    type AparteSubagent,
    type AparteSubagentStatus,
    type AparteSubagentSegment,
} from './types.js';

/** Replies followed at once by one setup: past this, the oldest is forgotten (a run nobody ended). */
const MAX_RUNS = 64;
/** Sub-agents in one reply: past this, a new one is not drawn. */
const MAX_LANES = 512;
/** Events held for sub-agents not announced yet, per reply. */
const MAX_EARLY = 2000;

/** Events written at the next frame: the ones that only grow what is already there. */
const COALESCED = new Set<AparteStreamRunEvent['type']>(['text-delta', 'thinking-delta', 'sources', 'text-flush', 'turn-start']);

/** A call's state that a person or the turn is still waiting on. */
const isOpen = (status: AparteToolCallSegment['status'] | undefined): boolean =>
    (status ?? 'pending') === 'pending' || status === 'awaiting-approval';

/** Every lane list, from every setup: an adapter writing one also calls the observers, and that echo is ignored. */
const laneLists = new WeakSet<object>();

/**
 * Who draws a reply's sub-agents, when two setups hear the same run (one on a chat's config,
 * one on the global): the first to see a sub-agent's event, which is the chat's — observers
 * are called the chat's config first. Per target, per reply.
 */
const claims = new WeakMap<object, Map<string, object>>();

function claim(target: object, messageId: string, owner: object): boolean {
    let byMessage = claims.get(target);
    if (!byMessage) claims.set(target, (byMessage = new Map()));
    const holder = byMessage.get(messageId);
    if (holder) return holder === owner;
    byMessage.set(messageId, owner);
    return true;
}

function release(target: object, messageId: string, owner: object): void {
    const byMessage = claims.get(target);
    if (byMessage?.get(messageId) === owner) byMessage.delete(messageId);
}

/** Once per animation frame where there is one (a page), else on a short timer (Node, a worker). */
function nextFrame(fn: () => void): () => void {
    if (typeof requestAnimationFrame === 'function') {
        const handle = requestAnimationFrame(fn);
        return () => cancelAnimationFrame(handle);
    }
    const handle = setTimeout(fn, 16);
    return () => clearTimeout(handle);
}

interface Lane {
    readonly id: string;
    name?: string;
    description?: string;
    readonly parentId?: string;
    status: AparteSubagentStatus;
    result?: string;
    error?: string;
    /** Its conversation, and the adapter that writes it. */
    readonly list: AparteSegmentList;
    readonly emit: AparteStreamRunEmitter;
    /** Where its anchor lives: the reply, or its parent's lane. */
    readonly host: Lane | null;
    readonly anchorId: string;
    readonly anchorKind: 'call' | 'own';
    /** The anchor exists: its call's row was added. */
    ready: boolean;
    /** Its own anchor streams while it works. */
    streaming: boolean;
    /** Its calls waiting for a person. */
    readonly asking: Set<string>;
    /** The plugin set the spawning call to `awaiting-approval`, and owes it its `pending` back. */
    holding: boolean;
    readonly depth: number;
}

interface Run {
    readonly messageId: string;
    readonly target: StreamAdapterTarget;
    readonly targetId?: string;
    readonly lanes: Map<string, Lane>;
    /** The sub-agent each call opened, per host (`''` for the reply, else the parent's id). */
    readonly callAgents: Map<string, string>;
    /** Events for sub-agents not announced yet (a resume after a reload). */
    readonly early: Map<string, AparteStreamRunEvent[]>;
    earlyCount: number;
    /** Lanes whose call has not been started yet, by host and call. */
    readonly awaitingRow: Map<string, Lane[]>;
    /** Lanes whose call's row was just started: ready once the reply has added it. */
    rowsDue: Lane[];
    readonly dirty: Set<Lane>;
    cancelFrame: (() => void) | null;
    closed: boolean;
    unlisten: () => void;
}

/** Cancel the frame a run's writes wait for, if any. */
function stopFrame(run: Run): void {
    const cancel = run.cancelFrame;
    run.cancelFrame = null;
    cancel?.();
}

const hostKey = (host: Lane | null, toolCallId: string): string => `${host?.id ?? ''}\u0000${toolCallId}`;

/** The plugin segment that stands for a sub-agent no call opened. */
const ownSegmentId = (agentId: string): string => `subagent-${agentId}`;

/** The observer of one setup, and what forgets everything it follows. */
export function createLanes(): { observe: (event: AparteStreamRunEvent, ctx: AparteRunEventContext) => void; dispose: () => void } {
    const owner = {};
    const runs = new Map<string, Run>();
    /** Replies whose run is over, the latest few: a late event for one opens nothing. */
    const over = new Set<string>();

    /** The reply's segments as the target holds them; `undefined` when the target cannot say. */
    const replySegments = (run: Run): readonly AparteSegment[] | undefined => {
        const t = run.target as { getMessage?: (id: string) => AparteMessage | undefined; getMessages?: () => AparteMessage[] };
        try {
            const message = t.getMessage?.(run.messageId) ?? t.getMessages?.()?.find((m) => m.id === run.messageId);
            return message ? (message.segments ?? []) : undefined;
        } catch {
            return undefined;
        }
    };

    const hostSegments = (run: Run, host: Lane | null): readonly AparteSegment[] | undefined =>
        (host ? host.list.segments : replySegments(run));

    const anchorOf = (run: Run, lane: Lane): AparteSegment | undefined =>
        hostSegments(run, lane.host)?.find((s) => s.id === lane.anchorId);

    /** Whether it, or a sub-agent of it, waits for a person. */
    const isWaiting = (run: Run, lane: Lane): boolean => {
        if (lane.status === 'waiting' || lane.asking.size > 0) return true;
        for (const other of run.lanes.values()) {
            if (other.host === lane && (other.status === 'running' || other.status === 'waiting') && isWaiting(run, other)) return true;
        }
        return false;
    };

    const snapshot = (run: Run, lane: Lane): AparteSubagent => ({
        id: lane.id,
        ...(lane.name !== undefined ? { name: lane.name } : {}),
        ...(lane.description !== undefined ? { description: lane.description } : {}),
        status: lane.status === 'running' && isWaiting(run, lane) ? 'waiting' : lane.status,
        ...(lane.result !== undefined ? { result: lane.result } : {}),
        ...(lane.error !== undefined ? { error: lane.error } : {}),
        ...(lane.parentId !== undefined ? { parentId: lane.parentId } : {}),
        segments: lane.list.segments as AparteSegment[],
    });

    /** Write a segment of the reply or of a lane — never another reply's, never after the run. */
    const write = (run: Run, host: Lane | null, segmentId: string, updates: Record<string, unknown>): void => {
        if (run.closed) return;
        if (host) {
            host.list.updateSegment?.(segmentId, updates as Partial<AparteSegment>);
            return;
        }
        // The target writes "the reply being streamed"; a reply it can read must hold the
        // segment, or the write would land on another one.
        const segments = replySegments(run);
        if (segments && !segments.some((s) => s.id === segmentId)) return;
        run.target.updateSegment?.(segmentId, updates as Partial<AparteSegment>);
    };

    const writeAnchor = (run: Run, lane: Lane): void => {
        const updates: Record<string, unknown> = { subagent: snapshot(run, lane) };
        if (lane.anchorKind === 'own') {
            updates['isStreaming'] = lane.streaming;
        } else {
            // While it waits for a person, the call that opened it says so: no dots, no fold.
            const call = anchorOf(run, lane) as AparteToolCallSegment | undefined;
            if (call && isOpen(call.status)) {
                const waiting = isWaiting(run, lane);
                if (waiting && call.status !== 'awaiting-approval') {
                    updates['status'] = 'awaiting-approval';
                    lane.holding = true;
                } else if (!waiting && lane.holding && call.status === 'awaiting-approval') {
                    updates['status'] = 'pending';
                    lane.holding = false;
                }
            }
        }
        write(run, lane.host, lane.anchorId, updates);
    };

    /** Write every lane that changed, a sub-agent before the parent whose lane holds it. */
    const flush = (run: Run): void => {
        if (run.closed) return;
        stopFrame(run);
        for (let guard = 0; run.dirty.size > 0 && guard < 10_000; guard += 1) {
            let deepest: Lane | undefined;
            for (const lane of run.dirty) if (!deepest || lane.depth > deepest.depth) deepest = lane;
            run.dirty.delete(deepest!);
            if (deepest!.ready) writeAnchor(run, deepest!);
        }
        // Writing a parent's lane scheduled a frame there is nothing left for.
        stopFrame(run);
    };

    const schedule = (run: Run): void => {
        if (run.cancelFrame || run.closed) return;
        run.cancelFrame = nextFrame(() => {
            run.cancelFrame = null;
            flush(run);
        });
    };

    // Named as core's own helper is, and with its contract: on the chat, bubbling, composed,
    // stamped with the chat's id. The events reference reads where an event goes out from this name.
    const dispatchLifecycleEvent = (run: Run, name: string, detail: Record<string, unknown>): void => {
        if (typeof CustomEvent !== 'function') return;
        const id = run.targetId ?? ((run.target as { id?: unknown }).id || undefined);
        try {
            run.target.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail: { targetId: id, ...detail } }));
        } catch { /* a target that cannot dispatch hears nothing */ }
    };

    const dispatchEnd = (run: Run, lane: Lane, status: AparteSubagentStatus): void =>
        dispatchLifecycleEvent(run, 'aparte-subagent-end', { messageId: run.messageId, agentId: lane.id, status });

    /** The lane's open segments, settled: its text streams no more, and at the run's end its open calls stop. */
    const settleLane = (lane: Lane, calls: boolean): void => {
        for (const segment of lane.list.segments) {
            if (segment.type === 'tool_call') {
                if (calls && isOpen((segment as AparteToolCallSegment).status)) {
                    lane.list.updateSegment?.(segment.id, { status: 'aborted' } as Partial<AparteSegment>);
                }
            } else if (segment.isStreaming === true) {
                lane.list.updateSegment?.(segment.id, { isStreaming: false });
            }
        }
    };

    /** The run is over: everything written one last time, then forgotten. */
    const close = (run: Run): void => {
        if (run.closed) return;
        for (const lane of run.lanes.values()) {
            const working = lane.status === 'running' || lane.status === 'waiting';
            settleLane(lane, true);
            lane.streaming = false;
            run.dirty.add(lane);
            if (working) dispatchEnd(run, lane, 'stopped');
        }
        flush(run);
        forget(run);
    };

    /** Drop a run without writing anything. */
    const forget = (run: Run): void => {
        run.closed = true;
        stopFrame(run);
        run.unlisten();
        release(run.target, run.messageId, owner);
        if (runs.get(run.messageId) === run) runs.delete(run.messageId);
        over.add(run.messageId);
        if (over.size > MAX_RUNS) over.delete(over.values().next().value!);
    };

    const markDirty = (run: Run, lane: Lane, now: boolean): void => {
        run.dirty.add(lane);
        if (now) flush(run);
        else schedule(run);
    };

    /** The rows started since the last event are in the reply now: their lanes can be written. */
    const settleDueRows = (run: Run): void => {
        if (run.rowsDue.length === 0) return;
        const due = run.rowsDue;
        run.rowsDue = [];
        for (const lane of due) {
            lane.ready = true;
            run.dirty.add(lane);
        }
        flush(run);
    };

    /** A call was started: a sub-agent announced before it can be written now. */
    const callStarted = (run: Run, host: Lane | null, toolCallId: string): void => {
        const key = hostKey(host, toolCallId);
        const held = run.awaitingRow.get(key);
        if (!held) return;
        run.awaitingRow.delete(key);
        if (host) {
            // A lane's call is in its list as soon as its adapter is fed.
            for (const lane of held) { lane.ready = true; run.dirty.add(lane); }
            flush(run);
            return;
        }
        // The reply's row is added AFTER the observers hear `tool-start`: ready on the next
        // event, or once this one has been handled.
        run.rowsDue.push(...held);
        queueMicrotask(() => settleDueRows(run));
    };

    const listen = (run: Run): (() => void) => {
        const target = run.target as Partial<Pick<EventTarget, 'addEventListener' | 'removeEventListener'>>;
        if (typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') return () => {};
        const mine = (e: Event): boolean => (e as CustomEvent<{ messageId?: unknown }>).detail?.messageId === run.messageId;
        const onEnd = (e: Event): void => { if (mine(e)) close(run); };
        // A pause keeps the lanes, and written: the conversation is saved on this event. The
        // reply's own segments were just settled with the message, so a sub-agent still
        // working gets its own segment back open.
        const onPause = (e: Event): void => {
            if (!mine(e)) return;
            for (const lane of run.lanes.values()) run.dirty.add(lane);
            flush(run);
        };
        // Capture, on the target itself: before the chat's own listeners, which save.
        const ends = ['aparte-message-done', 'aparte-message-aborted', 'aparte-message-error'];
        for (const name of ends) target.addEventListener!(name, onEnd, true);
        target.addEventListener!('aparte-message-paused', onPause, true);
        return () => {
            for (const name of ends) target.removeEventListener!(name, onEnd, true);
            target.removeEventListener!('aparte-message-paused', onPause, true);
        };
    };

    const openRun = (ctx: AparteRunEventContext): Run | undefined => {
        if (!claim(ctx.target, ctx.messageId, owner)) return undefined;
        if (runs.size >= MAX_RUNS) {
            const oldest = runs.values().next().value;
            if (oldest) forget(oldest);
        }
        const run: Run = {
            messageId: ctx.messageId,
            target: ctx.target,
            ...(ctx.targetId !== undefined ? { targetId: ctx.targetId } : {}),
            lanes: new Map(),
            callAgents: new Map(),
            early: new Map(),
            earlyCount: 0,
            awaitingRow: new Map(),
            rowsDue: [],
            dirty: new Set(),
            cancelFrame: null,
            closed: false,
            unlisten: () => {},
        };
        run.unlisten = listen(run);
        runs.set(ctx.messageId, run);
        return run;
    };

    /** What the host already holds for this sub-agent: a lane saved before a reload, resumed now. */
    const savedAnchor = (segments: readonly AparteSegment[] | undefined, agentId: string, toolCallId?: string): AparteSegment | undefined => {
        if (!segments) return undefined;
        return segments.find((s) => s.id === ownSegmentId(agentId) && subagentOf(s)?.id === agentId)
            ?? (toolCallId ? segments.find((s) => s.id === `tool-${toolCallId}` && subagentOf(s)?.id === agentId) : undefined);
    };

    const startAgent = (run: Run, e: Extract<AparteStreamRunEvent, { type: 'agent-start' }>, ctx: AparteRunEventContext): void => {
        const known = run.lanes.get(e.agentId);
        if (known) {
            // A resumed sub-agent: the same lane, working again.
            known.status = 'running';
            delete known.result;
            delete known.error;
            if (e.name !== undefined) known.name = e.name;
            if (e.description !== undefined) known.description = e.description;
            known.streaming = true;
            announce(run, known, e.toolCallId);
            markDirty(run, known, true);
            return;
        }
        if (run.lanes.size >= MAX_LANES) return;

        const host = e.parentAgentId ? (run.lanes.get(e.parentAgentId) ?? null) : null;
        const segments = hostSegments(run, host);
        const saved = savedAnchor(segments, e.agentId, e.toolCallId);
        const callKey = e.toolCallId ? hostKey(host, e.toolCallId) : '';
        const callId = e.toolCallId ? `tool-${e.toolCallId}` : '';
        const callTaken = callKey !== '' && (run.callAgents.has(callKey)
            || !!segments?.some((s) => s.id === callId && subagentOf(s) && subagentOf(s)!.id !== e.agentId));
        const onCall = saved ? saved.type === 'tool_call' : callKey !== '' && !callTaken;
        if (onCall) run.callAgents.set(callKey, e.agentId);

        const previous = saved ? subagentOf(saved) : undefined;
        const list = createSegmentList({ messageId: run.messageId, ...(previous ? { segments: previous.segments } : {}), config: ctx.config });
        laneLists.add(list);
        const lane: Lane = {
            id: e.agentId,
            ...(e.name !== undefined ? { name: e.name } : previous?.name !== undefined ? { name: previous.name } : {}),
            ...(e.description !== undefined ? { description: e.description } : previous?.description !== undefined ? { description: previous.description } : {}),
            ...(e.parentAgentId !== undefined ? { parentId: e.parentAgentId } : {}),
            status: 'running',
            list,
            emit: createStreamAdapter({ target: list, config: ctx.config, messageId: run.messageId }),
            host,
            anchorId: onCall ? callId : ownSegmentId(e.agentId),
            anchorKind: onCall ? 'call' : 'own',
            ready: true,
            streaming: true,
            asking: new Set(),
            holding: false,
            depth: host ? host.depth + 1 : 0,
        };
        run.lanes.set(lane.id, lane);
        list.onChange(() => {
            if (!run.closed) {
                run.dirty.add(lane);
                schedule(run);
            }
        });

        if (lane.anchorKind === 'call' && !saved && segments && !segments.some((s) => s.id === lane.anchorId)) {
            // Announced before its call was started: written once the call's row is there.
            lane.ready = false;
            const key = callKey;
            run.awaitingRow.set(key, [...(run.awaitingRow.get(key) ?? []), lane]);
        } else if (lane.anchorKind === 'own' && !saved && !run.closed) {
            const segment: AparteSubagentSegment = {
                id: lane.anchorId,
                type: SUBAGENT_SEGMENT_TYPE,
                subagent: snapshot(run, lane),
                isStreaming: true,
            };
            if (host) host.list.addSegment?.(segment);
            else run.target.addSegment?.(segment);
        }

        announce(run, lane, e.toolCallId);
        // What arrived for it before it was announced.
        const early = run.early.get(lane.id);
        if (early) {
            run.early.delete(lane.id);
            run.earlyCount -= early.length;
            for (const event of early) feed(run, lane, event);
        }
        markDirty(run, lane, true);
    };

    const announce = (run: Run, lane: Lane, toolCallId: string | undefined): void =>
        dispatchLifecycleEvent(run, 'aparte-subagent-start', {
            messageId: run.messageId,
            agentId: lane.id,
            ...(lane.name !== undefined ? { name: lane.name } : {}),
            ...(lane.description !== undefined ? { description: lane.description } : {}),
            ...(toolCallId !== undefined ? { toolCallId } : {}),
            ...(lane.parentId !== undefined ? { parentId: lane.parentId } : {}),
        });

    const endAgent = (run: Run, e: Extract<AparteStreamRunEvent, { type: 'agent-end' }>): void => {
        const lane = run.lanes.get(e.agentId);
        if (!lane) return;
        lane.status = e.status;
        if (e.result !== undefined) lane.result = e.result;
        if (e.error !== undefined) lane.error = e.error;
        // Waiting is not over: its text and its calls stay as they are, its segment streams on.
        if (e.status !== 'waiting') {
            settleLane(lane, false);
            lane.streaming = false;
        }
        dispatchEnd(run, lane, e.status);
        markDirty(run, lane, true);
    };

    /** One of the sub-agent's own events, into its lane — without its `agentId`, as a reply's. */
    const feed = (run: Run, lane: Lane, e: AparteStreamRunEvent): void => {
        const { agentId: _owner, ...event } = e as AparteStreamRunEvent & { agentId?: string };
        if ('toolCallId' in event && typeof event.toolCallId === 'string') {
            if (event.type === 'tool-awaiting-approval') lane.asking.add(event.toolCallId);
            else if (event.type !== 'tool-start') lane.asking.delete(event.toolCallId);
        }
        const before = lane.list.segments.length;
        lane.emit(event as AparteStreamRunEvent);
        if (event.type === 'tool-start') callStarted(run, lane, event.toolCallId);
        const now = !COALESCED.has(event.type) || lane.list.segments.length !== before;
        markDirty(run, lane, now);
    };

    const observe = (event: AparteStreamRunEvent, ctx: AparteRunEventContext): void => {
        // A lane's own adapter calls the observers too, with the events already stripped.
        if (laneLists.has(ctx.target)) return;
        const agentId = (event as { agentId?: unknown }).agentId;
        const attributed = typeof agentId === 'string' || event.type === 'agent-start' || event.type === 'agent-end';
        let run = runs.get(ctx.messageId);
        if (run && run.target !== ctx.target) return;
        if (!run) {
            if (!attributed || over.has(ctx.messageId)) return;
            run = openRun(ctx);
            if (!run) return;
        }
        settleDueRows(run);

        if (!attributed) {
            switch (event.type) {
                case 'tool-start':
                    callStarted(run, null, event.toolCallId);
                    break;
                case 'run-suspended':
                    for (const lane of run.lanes.values()) run.dirty.add(lane);
                    flush(run);
                    break;
                case 'run-done':
                case 'run-aborted':
                    close(run);
                    break;
                default:
                    break;
            }
            return;
        }
        if (event.type === 'agent-start') {
            startAgent(run, event, ctx);
            return;
        }
        if (event.type === 'agent-end') {
            endAgent(run, event);
            return;
        }
        // A sub-agent never ends the run, nor its own lane's reply.
        if (event.type === 'run-start' || event.type === 'run-done' || event.type === 'run-aborted' || event.type === 'run-suspended') return;
        const lane = run.lanes.get(agentId as string);
        if (lane) {
            feed(run, lane, event);
            return;
        }
        // Not announced yet (a resume after a reload): held until it is.
        if (run.earlyCount >= MAX_EARLY) return;
        run.early.set(agentId as string, [...(run.early.get(agentId as string) ?? []), event]);
        run.earlyCount += 1;
    };

    return {
        observe,
        dispose: () => {
            for (const run of [...runs.values()]) forget(run);
        },
    };
}
