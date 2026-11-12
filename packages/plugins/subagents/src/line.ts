/**
 * A sub-agent's line: core's tool row, named by what ran it.
 *
 * The plugin gives core a tool-line provider (`setToolLineProvider`): for a call that carries
 * a sub-agent — the call that opened it, or the call the plugin's own segment stands in for —
 * it says the sub-agent's name, its task, what it is doing now and how far it got. Core reads
 * it AFTER the app's `registerToolDisplay`, field by field, so the app's label, summary and
 * details always win. It is asked at every draw, update and relabel and stores nothing: the
 * counts and the words follow the reader's language, and the duration moves with every update
 * the sub-agent's work brings (there is no timer per row: a sub-agent that is silent — waiting
 * on a long tool — shows the duration of its last update until the next one).
 */
import {
    contextConfig,
    formatDuration,
    segmentTiming,
    type AparteConfig,
    type AparteSegment,
    type AparteToolCallSegment,
    type AparteToolDetails,
    type AparteToolLine,
} from '@aparte/core';
import { statusOfCall, subagentOf, subagentStatus } from './status.js';
import { toolCount, word } from './words.js';
import type { AparteSubagent, AparteSubagentStatus, SubagentsOptions } from './types.js';

/** The calls the plugin's own segments hand to core's row: named by the agent, not by a tool. */
const standIns = new WeakSet<object>();

/** Mark a call built to draw a `subagent` segment with core's row. */
export function markStandIn(segment: AparteToolCallSegment): AparteToolCallSegment {
    standIns.add(segment);
    return segment;
}

/**
 * What `details: 'transcript'` puts under the line — the sub-agent's conversation. Filled by
 * the transcript module; until it is, `'transcript'` draws the line alone.
 */
let transcriptDetails: AparteToolDetails | undefined;

/** Give `details: 'transcript'` what it draws. */
export function provideTranscript(details: AparteToolDetails | undefined): void {
    transcriptDetails = details;
}

const isOpenCall = (segment: AparteSegment): segment is AparteToolCallSegment =>
    segment.type === 'tool_call'
    && ['pending', 'awaiting-approval'].includes((segment as AparteToolCallSegment).status ?? 'pending');

/** Plain text, trimmed; `''` for anything else or for a function that throws. */
const textOf = (read: () => unknown): string => {
    try {
        const value = read();
        return typeof value === 'string' ? value.trim() : '';
    } catch {
        return '';
    }
};

/**
 * A call of the sub-agent's as its own row names it: the app's label, else the name of the
 * sub-agent it opened, else its identifier; then what it targets, from the app's summary, else
 * that sub-agent's task.
 */
function callLine(call: AparteToolCallSegment, config: AparteConfig): string {
    const name = call.toolCall?.name ?? '';
    const nested = subagentOf(call);
    const label = config.getToolDisplay(name)?.label;
    const shown = (label !== undefined ? textOf(() => (typeof label === 'function' ? label(call) : label)) : '')
        || nested?.name?.trim() || name;
    const summary = config.getToolSummary(name);
    const target = (summary ? textOf(() => summary(call)) : '') || nested?.description?.trim() || '';
    return [shown, target].filter(Boolean).join(' ');
}

/** What it is doing now: its latest call still running or waiting, as that call's row names it. */
function activityOf(sub: AparteSubagent, config: AparteConfig): string {
    for (let i = sub.segments.length - 1; i >= 0; i -= 1) {
        const segment = sub.segments[i]!;
        if (isOpenCall(segment)) return callLine(segment, config);
    }
    return '';
}

/**
 * How long it worked: from when its line started to now while it works, else to the last
 * moment its conversation moved — data saved with it, so a reload reads the same number.
 */
function durationOf(anchor: AparteSegment, sub: AparteSubagent, live: boolean): number | undefined {
    const start = segmentTiming(anchor)?.startedAt;
    if (start === undefined) return undefined;
    if (live) return Math.max(0, Date.now() - start);
    let end: number | undefined;
    for (const segment of sub.segments) {
        const timing = segmentTiming(segment);
        const at = timing?.endedAt ?? timing?.startedAt;
        if (at !== undefined && (end === undefined || at > end)) end = at;
    }
    end ??= segmentTiming(anchor)?.endedAt;
    return end === undefined || end < start ? undefined : end - start;
}

/** A state in the words core's badge uses. */
function stateWord(config: AparteConfig, status: AparteSubagentStatus): string {
    switch (status) {
        case 'running': return config.t('toolRunning');
        case 'waiting': return config.t('approvalWaiting');
        case 'done': return config.t('toolCompleted');
        case 'failed': return config.t('toolFailed');
        default: return config.t('toolStopped');
    }
}

/**
 * The provider: the line of every call that carries a sub-agent, `undefined` for any other
 * call (core's own line then).
 */
export function createLineProvider(options: SubagentsOptions = {}): (segment: AparteToolCallSegment) => AparteToolLine | undefined {
    return (segment) => {
        const sub = subagentOf(segment);
        if (!sub) return undefined;
        const config = contextConfig();
        const standIn = standIns.has(segment);
        const status = subagentStatus(segment);
        const live = status === 'running' || status === 'waiting';
        const line: AparteToolLine = {};

        const name = sub.name?.trim();
        if (name) line.label = name;
        else if (standIn) line.label = word(config, 'subagentsUnnamed');
        const task = sub.description?.trim();
        if (task) line.target = task;

        if (options.activity !== false && live) {
            const activity = activityOf(sub, config);
            if (activity) line.activity = activity;
        }

        // The state, only where the row's own badge would say another: the row is the CALL's,
        // and a call can be over while the sub-agent it opened failed or was stopped — or
        // still running after one of its sub-agents is done. A stand-in's row always agrees.
        const note: string[] = [];
        if (!standIn && statusOfCall(segment.status) !== status) note.push(stateWord(config, status));
        if (options.counts !== false) {
            const tools = sub.segments.filter((s) => s.type === 'tool_call').length;
            if (tools > 0) note.push(toolCount(config, tools));
            const ms = durationOf(segment, sub, live);
            if (ms !== undefined) {
                const tag = config.getLocale().tag;
                note.push(formatDuration(ms, typeof tag === 'string' && tag ? tag : undefined));
            }
        }
        if (note.length > 0) line.note = note.join(' · ');

        const details = options.details;
        line.details = typeof details === 'function' ? details
            : details === 'transcript' ? (transcriptDetails ?? false)
            : false;
        return line;
    };
}
