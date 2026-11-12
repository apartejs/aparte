/**
 * What a tool call is called, and what it targets — read by the transcript row AND by the
 * approval question, so a person cannot read the two differently (the same reason
 * `tool-input.ts` exists for the arguments).
 */
import type { AparteConfig } from '../config/aparte-config.js';
import type { AparteToolCallSegment, AparteToolLine } from '../types/index.js';

/** Providers that threw, each reported once: one throws on every token otherwise. */
const reported = new WeakSet<object>();

/**
 * What the config's tool-line provider says about this call (`setToolLineProvider`), or
 * `undefined` when there is none, it says nothing, or it throws — the default line then.
 * Called at every draw, update and relabel, never stored: its words follow the locale.
 */
export function toolLineOf(segment: AparteToolCallSegment, config: AparteConfig): AparteToolLine | undefined {
    const provider = config.getToolLineProvider();
    if (!provider) return undefined;
    try {
        const line = provider(segment);
        return line && typeof line === 'object' ? line : undefined;
    } catch (err) {
        if (!reported.has(provider)) {
            reported.add(provider);
            console.error('[aparte] The tool-line provider threw; the row keeps its default line. Further throws from it are not reported.', err);
        }
        return undefined;
    }
}

/** A provider's field as the row writes it: trimmed text, `''` for anything else. */
const textOf = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * The name a call goes by: the label its display declares (`registerToolDisplay`), else the
 * label the tool-line provider gives, else the identifier — the app's wire format, which
 * core never turns into words on its own. A label that throws or says nothing costs the
 * call its label, not its render.
 *
 * `line` is the provider's answer when the caller already asked for it (the row asks once
 * per draw); left out, it is asked here.
 */
export function toolNameOf(
    segment: AparteToolCallSegment,
    config: AparteConfig,
    line: AparteToolLine | undefined = toolLineOf(segment, config),
): { text: string; isLabel: boolean } {
    const identifier = segment.toolCall?.name ?? 'tool';
    const label = config.getToolDisplay(identifier)?.label;
    if (label !== undefined) {
        try {
            const text = typeof label === 'function' ? label(segment) : label;
            if (typeof text === 'string' && text.trim()) return { text: text.trim(), isLabel: true };
        } catch { /* the provider's, below */ }
    }
    const provided = textOf(line?.label);
    if (provided) return { text: provided, isLabel: true };
    return { text: identifier, isLabel: false };
}

/**
 * What a call targets, from the summary its display declares, else the target the
 * tool-line provider gives — `''` when neither says anything, or when the summary throws:
 * a summary reads model-chosen input, and a bad one must cost the call its one line, not
 * the bubble its render.
 */
export function toolTargetOf(
    segment: AparteToolCallSegment,
    config: AparteConfig,
    line: AparteToolLine | undefined = toolLineOf(segment, config),
): string {
    const summary = config.getToolSummary(segment.toolCall?.name ?? '');
    if (summary) {
        try {
            const text = textOf(summary(segment));
            if (text) return text;
        } catch { /* the provider's, below */ }
    }
    return textOf(line?.target);
}

/**
 * What the call is doing now, from the tool-line provider — only while it runs or waits for
 * a person: a finished call is not doing anything.
 */
export function toolActivityOf(segment: AparteToolCallSegment, line: AparteToolLine | undefined): string {
    const status = segment.status ?? 'pending';
    if (status !== 'pending' && status !== 'awaiting-approval') return '';
    return textOf(line?.activity);
}

/** The provider's trailing note, in every state. */
export function toolLineNoteOf(line: AparteToolLine | undefined): string {
    return textOf(line?.note);
}
