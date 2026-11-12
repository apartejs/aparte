/**
 * What a sub-agent's line says it is doing, read off the segment alone — so a reload and a
 * Stop read right with no bookkeeping of their own.
 */
import type { AparteSegment, AparteToolCallSegment } from '@aparte/core';
import { SUBAGENT_SEGMENT_TYPE, type AparteSubagent, type AparteSubagentStatus } from './types.js';

const STATUSES = new Set<AparteSubagentStatus>(['running', 'waiting', 'done', 'failed', 'stopped']);

/**
 * The sub-agent a segment stands for: the one kept on a `tool_call` segment (the call that
 * opened it) or on a `subagent` segment. `undefined` for any other segment.
 */
export function subagentOf(segment: AparteSegment): AparteSubagent | undefined {
    const value = (segment as { subagent?: unknown }).subagent;
    if (!value || typeof value !== 'object') return undefined;
    const sub = value as Partial<AparteSubagent>;
    if (typeof sub.id !== 'string') return undefined;
    if (segment.type !== 'tool_call' && segment.type !== SUBAGENT_SEGMENT_TYPE) return undefined;
    return {
        ...sub,
        id: sub.id,
        status: STATUSES.has(sub.status as AparteSubagentStatus) ? sub.status as AparteSubagentStatus : 'stopped',
        segments: Array.isArray(sub.segments) ? sub.segments : [],
    };
}

/** Whether the segment that stands for a sub-agent has settled: its call is over, or it streams no more. */
function anchorSettled(segment: AparteSegment): boolean {
    if (segment.type === 'tool_call') {
        const status = (segment as AparteToolCallSegment).status;
        return status !== 'pending' && status !== 'awaiting-approval';
    }
    return segment.isStreaming !== true;
}

/**
 * Where the sub-agent a segment stands for is: its stored status, except that one stored as
 * working (`running`, `waiting`) reads `stopped` once its segment has settled without it — the
 * call that opened it is over, or its own segment streams no more. That is what a reloaded
 * conversation and a Stop look like: nothing will ever end it. A segment that stands for no
 * sub-agent reads `stopped`.
 */
export function subagentStatus(segment: AparteSegment): AparteSubagentStatus {
    const sub = subagentOf(segment);
    if (!sub) return 'stopped';
    if ((sub.status === 'running' || sub.status === 'waiting') && anchorSettled(segment)) return 'stopped';
    return sub.status;
}

/** What a call's own status says of a sub-agent, as its row shows it. */
export function statusOfCall(status: AparteToolCallSegment['status'] | undefined): AparteSubagentStatus {
    switch (status ?? 'pending') {
        case 'pending': return 'running';
        case 'awaiting-approval': return 'waiting';
        case 'resolved': return 'done';
        case 'failed': return 'failed';
        default: return 'stopped';
    }
}

/** The call status that says a sub-agent's status on a row — the reverse of {@link statusOfCall}. */
export function callStatusOf(status: AparteSubagentStatus): AparteToolCallSegment['status'] {
    switch (status) {
        case 'running': return 'pending';
        case 'waiting': return 'awaiting-approval';
        case 'done': return 'resolved';
        case 'failed': return 'failed';
        default: return 'aborted';
    }
}
