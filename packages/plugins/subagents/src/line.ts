/**
 * A sub-agent's line: core's tool row, named by what ran it.
 *
 * The plugin gives core a tool-line provider (`setToolLineProvider`): for a call that carries
 * a sub-agent — the call that opened it, or the call the plugin's own segment stands in for —
 * it says the sub-agent's name and its task, and on a second line, from the sub-agent's start to
 * its end, what it is on ("Starting…", then its running call, else the step it announced, else
 * its latest call) and once it is over what it did
 * ("3 tools · 12s"). The second line is there the whole time, so the row keeps its height: one
 * that grew a line when the sub-agent began acting and lost it at its end moved every row under
 * it twice, and a count that grew beside the task moved the task. Core reads it AFTER the app's
 * `registerToolDisplay`, field by field, so the app's label, summary and details always win. It
 * is asked at every draw, update and relabel and stores nothing: the counts and the words follow
 * the reader's language.
 */
import {
    contextConfig,
    formatDuration,
    segmentTiming,
    type AparteConfig,
    type AparteSegment,
    type AparteToolCallSegment,
    type AparteToolLine,
} from '@aparte/core';
import { statusOfCall, subagentOf, subagentStatus } from './status.js';
import { dispatchOpen, isShown } from './open.js';
import { currentStep } from './steps.js';
import { subagentTranscript } from './transcript.js';
import { toolCount, word } from './words.js';
import type { AparteSubagent, AparteSubagentStatus, SubagentsOptions } from './types.js';

/** The calls the plugin's own segments hand to core's row: named by the agent, not by a tool. */
const standIns = new WeakSet<object>();

/** Mark a call built to draw a `subagent` segment with core's row. */
export function markStandIn(segment: AparteToolCallSegment): AparteToolCallSegment {
    standIns.add(segment);
    return segment;
}

/** A call running or waiting for a person — not one queued behind another, which is next, not now. */
const isOpenCall = (segment: AparteSegment): segment is AparteToolCallSegment =>
    segment.type === 'tool_call'
    && ['pending', 'awaiting-approval'].includes((segment as AparteToolCallSegment).status ?? 'pending')
    && !(segment as AparteToolCallSegment).queued;

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

/**
 * What it is doing now: the call running or waiting, as that call's row names it; else the
 * step it announced and is still on ("Reading the parser"); else its LATEST call, the last one
 * that finished. Only a call open at that instant used to count,
 * and with fast tools the line never said anything: the call was over before the next draw.
 * The caller asks only while the sub-agent runs or waits, so a finished call reads as the
 * step it is on until the next one starts (it is thinking or writing about that result).
 */
function activityOf(sub: AparteSubagent, config: AparteConfig, step: string | undefined): string {
    let latest: AparteToolCallSegment | undefined;
    for (let i = sub.segments.length - 1; i >= 0; i -= 1) {
        const segment = sub.segments[i]!;
        if (segment.type !== 'tool_call') continue;
        if (isOpenCall(segment)) return callLine(segment, config);
        latest ??= segment as AparteToolCallSegment;
    }
    if (step) return step;
    return latest ? callLine(latest, config) : '';
}

/**
 * How long it worked: from when its line started to the last moment its conversation moved —
 * data saved with it, so a reload reads the same number.
 */
function durationOf(anchor: AparteSegment, sub: AparteSubagent): number | undefined {
    const start = segmentTiming(anchor)?.startedAt;
    if (start === undefined) return undefined;
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

        // What it did: "N tools · duration", once it is over — while it works the line says what
        // it is on, and a count that grew with each call moved the task beside it.
        const summary = (): string => {
            if (options.counts === false) return '';
            const parts: string[] = [];
            const tools = sub.segments.filter((s) => s.type === 'tool_call').length;
            if (tools > 0) parts.push(toolCount(config, tools));
            const ms = durationOf(segment, sub);
            if (ms !== undefined) {
                const tag = config.getLocale().tag;
                parts.push(formatDuration(ms, typeof tag === 'string' && tag ? tag : undefined));
            }
            return parts.join(' · ');
        };

        // The state, only where the row's own badge would say another: the row is the CALL's,
        // and a call can be over while the sub-agent it opened failed or was stopped — or
        // still running after one of its sub-agents is done. A stand-in's row always agrees.
        const note: string[] = [];
        if (!standIn && statusOfCall(segment.status) !== status) note.push(stateWord(config, status));

        if (options.activity !== false) {
            // The second line, from its start to its end: what it is on, then what it did (in
            // the state's word when there is no count to give, so the line is never empty).
            line.activity = live
                ? activityOf(sub, config, currentStep(segment.messageId, sub.id)) || word(config, 'subagentsStarting')
                : summary() || stateWord(config, status);
        } else if (!live) {
            // One line: what it did comes after the state, once, at its end.
            const done = summary();
            if (done) note.push(done);
        }
        if (note.length > 0) line.note = note.join(' · ');

        const details = options.details;
        line.details = typeof details === 'function' ? details
            : details === 'transcript' ? subagentTranscript
            : false;

        // Somewhere else to read it: core draws the button, the plugin says what it opens.
        if (options.open === 'event') {
            const shownName = name || word(config, 'subagentsUnnamed');
            line.open = {
                label: word(config, 'subagentsOpen').replace('{name}', () => shownName),
                current: isShown(segment.messageId, sub.id),
                onOpen: (row) => dispatchOpen(row, segment, sub, standIn),
            };
        }
        return line;
    };
}
