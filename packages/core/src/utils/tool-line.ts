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
 * What the config's tool-line providers say about this call (`setToolLineProvider`, then
 * each `registerToolLineProvider` in order — the first to answer wins), or `undefined` when
 * there is none, none says anything, or a throwing one is the only one — the default line
 * then. Called at every draw, update and relabel, never stored: its words follow the locale.
 */
export function toolLineOf(segment: AparteToolCallSegment, config: AparteConfig): AparteToolLine | undefined {
    for (const provider of config.getToolLineProviders()) {
        try {
            const line = provider(segment);
            if (line && typeof line === 'object') return line;
        } catch (err) {
            if (!reported.has(provider)) {
                reported.add(provider);
                console.error('[aparte] A tool-line provider threw; the row keeps its default line. Further throws from it are not reported.', err);
            }
        }
    }
    return undefined;
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
    return toolTargetPartsOf(segment, config, line).text;
}

/**
 * The target and where it came from: `isWords` when the tool-line provider gave it (a
 * sentence for a person — a sub-agent's task), not the app's summary, which is read off the
 * arguments (a path, a command) and keeps the code face on an agent's row.
 */
export function toolTargetPartsOf(
    segment: AparteToolCallSegment,
    config: AparteConfig,
    line: AparteToolLine | undefined = toolLineOf(segment, config),
): { text: string; isWords: boolean } {
    const summary = config.getToolSummary(segment.toolCall?.name ?? '');
    if (summary) {
        try {
            const text = textOf(summary(segment));
            if (text) return { text, isWords: false };
        } catch { /* the provider's, below */ }
    }
    const text = textOf(line?.target);
    return { text, isWords: text !== '' };
}

/** A display field that is text or a function of the call: its trimmed text, `''` for nothing, or when it throws. */
function displayText(
    field: string | ((segment: AparteToolCallSegment) => string) | undefined,
    segment: AparteToolCallSegment,
): string {
    if (field === undefined) return '';
    try {
        return textOf(typeof field === 'function' ? field(segment) : field);
    } catch {
        return '';
    }
}

/**
 * The row's second line: the app's `activity` on the tool's display, else the tool-line
 * provider's, in every state it gives one. Core says nothing there on its own.
 */
export function toolActivityOf(segment: AparteToolCallSegment, line: AparteToolLine | undefined, config: AparteConfig): string {
    // In every state the app or a provider gives one: a row keeps its height from its start to its end
    // only if its second line does not come and go with the call's state.
    return displayText(config.getToolDisplay(segment.toolCall?.name ?? '')?.activity, segment) || textOf(line?.activity);
}

/** The row's trailing note: the app's `note` on the tool's display, else the provider's, in every state. */
export function toolLineNoteOf(segment: AparteToolCallSegment, line: AparteToolLine | undefined, config: AparteConfig): string {
    return displayText(config.getToolDisplay(segment.toolCall?.name ?? '')?.note, segment) || textOf(line?.note);
}
