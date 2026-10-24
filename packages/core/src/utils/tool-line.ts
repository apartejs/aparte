/**
 * What a tool call is called, and what it targets — read by the transcript row AND by the
 * approval question, so a person cannot read the two differently (the same reason
 * `tool-input.ts` exists for the arguments).
 */
import type { AparteConfig } from '../config/aparte-config.js';
import type { AparteToolCallSegment } from '../types/index.js';

/**
 * The name a call goes by: the label its display declares (`registerToolDisplay`), else
 * the identifier — the app's wire format, which core never turns into words on its own.
 * A label that throws or says nothing costs the call its label, not its render.
 */
export function toolNameOf(segment: AparteToolCallSegment, config: AparteConfig): { text: string; isLabel: boolean } {
    const identifier = segment.toolCall?.name ?? 'tool';
    const label = config.getToolDisplay(identifier)?.label;
    if (label !== undefined) {
        try {
            const text = typeof label === 'function' ? label(segment) : label;
            if (typeof text === 'string' && text.trim()) return { text: text.trim(), isLabel: true };
        } catch { /* the identifier, below */ }
    }
    return { text: identifier, isLabel: false };
}

/**
 * What a call targets, from the summary its display declares — `''` when there is none,
 * or when it throws: a summary reads model-chosen input, and a bad one must cost the call
 * its one line, not the bubble its render.
 */
export function toolTargetOf(segment: AparteToolCallSegment, config: AparteConfig): string {
    const summary = config.getToolSummary(segment.toolCall?.name ?? '');
    if (!summary) return '';
    try {
        const text = summary(segment);
        return typeof text === 'string' ? text.trim() : '';
    } catch {
        return '';
    }
}
