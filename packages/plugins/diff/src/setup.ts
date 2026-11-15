/**
 * `setupDiff()` — a tool's result shown as a diff, under the tool's line in the reply.
 *
 * An edit tool's row keeps everything core gives it: its name, the summary the app set, its
 * states (running, waiting for approval, refused, failed). What it holds behind its line is
 * the change, opened — `<aparte-diff>` in place of the raw Input and Output. Through the
 * display's `details`, so it is the same row in every framework and every state.
 *
 * DOM-free at import: the element is created only when a chat draws a resolved call, in a
 * browser. On a server the setup registers the same display and draws nothing.
 */
import { aparteGlobalConfig, type AparteConfig, type AparteToolCall, type AparteToolCallSegment, type AparteToolDisplay, type AparteToolMatcher } from '@aparte/core';
import { parseUnifiedDiff } from './parse.js';
import type { AparteDiffInput } from './types.js';

/** How an app shows a tool's result as a diff. */
export interface DiffSetupOptions {
    /** The tool (or tools) whose result is a change. */
    tool: AparteToolMatcher | AparteToolMatcher[];
    /**
     * The change, from the tool's result — its `structuredContent` when it has one, else its
     * text parsed as JSON, else the text — and the call's input: a unified diff's text,
     * `{ path, before, after }`, or a list of files. Return `null` for a result with no change
     * to show. Without `map`, the result must already be one of those.
     */
    // `any`: the result's shape is your tool's, and `map` is where you read it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map?: (result: any, input: Record<string, unknown>, segment: AparteToolCallSegment) => AparteDiffInput | null | undefined;
    /**
     * The change a call WOULD make, from its input, for the approval question: drawn between
     * the question and its buttons before the call has run. Left out, it is read from the input
     * when that holds two texts: `before` and `after`, or `old_string` and `new_string`, with
     * the file's name in `path` or `file_path`. Return `null` for a call with nothing to show;
     * `false` asks for no preview.
     */
    preview?: false | ((input: Record<string, unknown>, call: AparteToolCall) => AparteDiffInput | null | undefined);
    /** Let the reader comment on its lines: `aparte-diff-comment` bubbles out of the chat. Off by default. */
    commentable?: boolean;
    /** Show the diff opened under the line (the default), or `false` for closed until the reader opens it. */
    open?: boolean;
}

/** The change an input holds as two texts, or `null`: `before`/`after`, or `old_string`/`new_string`. */
function previewFromInput(input: Record<string, unknown>): AparteDiffInput | null {
    const before = input['before'] ?? input['old_string'];
    const after = input['after'] ?? input['new_string'];
    if (typeof before !== 'string' || typeof after !== 'string') return null;
    const path = input['path'] ?? input['file_path'];
    return { path: typeof path === 'string' ? path : '', before, after };
}

function parseResult(segment: AparteToolCallSegment): unknown {
    if (segment.structuredResult !== undefined) return segment.structuredResult;
    const text = segment.result;
    if (typeof text !== 'string') return undefined;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function fingerprint(value: unknown): string {
    try {
        return JSON.stringify(value) ?? '';
    } catch {
        return '';
    }
}

/** A side of a file's two texts: a text, or `null` for a file that is not there. */
const isSide = (side: unknown): boolean => typeof side === 'string' || side === null;

/** Whether `<aparte-diff>` can draw it: diff text that holds a file, a file's two texts, or a list of those. */
function drawable(value: unknown): value is AparteDiffInput {
    const texts = (item: object): boolean => {
        const { before, after } = item as { before?: unknown; after?: unknown };
        return isSide(before) && isSide(after) && (before !== null || after !== null);
    };
    const one = (item: unknown): boolean => typeof item === 'object' && item !== null
        && (texts(item) || Array.isArray((item as { hunks?: unknown }).hunks));
    if (typeof value === 'string') return parseUnifiedDiff(value).length > 0;
    if (Array.isArray(value)) return value.length > 0 && value.every(one);
    return one(value);
}

/**
 * Show a tool's result as a diff, under the tool's line in the reply. Returns the function that
 * takes it off again.
 *
 * The rest of the tool's display (its label, its summary, its icon) stays the app's: set it
 * with `registerToolDisplay` before or after. Taking the setup off gives back what the tool
 * showed behind its line before.
 *
 * @example
 * setupDiff({
 *   tool: 'edit_file',
 *   map: (result, input) => ({ path: String(input.path), before: result.before, after: result.after }),
 * });
 */
export function setupDiff(options: DiffSetupOptions, config: AparteConfig = aparteGlobalConfig): () => void {
    const matchers = Array.isArray(options.tool) ? options.tool : [options.tool];
    // The result each diff was drawn from. Weak: a diff lives in its row, and goes with it.
    const drawnFrom = new WeakMap<HTMLElement, string>();
    let warned = false;

    const details = (segment: AparteToolCallSegment, held?: HTMLElement): HTMLElement | string => {
        if (segment.status !== 'resolved' || typeof document === 'undefined') return '';
        const raw = parseResult(segment);
        const from = fingerprint(raw);
        // The same result drawn again in its row (an update, a language switch): the diff the
        // row already holds, with what the reader opened and wrote in it. Another row of the
        // same call — a pane beside the reply — draws its own.
        if (held && from && drawnFrom.get(held) === from) return held;
        let input: unknown;
        try {
            input = options.map ? options.map(raw, (segment.toolCall?.input ?? {}) as Record<string, unknown>, segment) : raw;
        } catch (error) {
            console.warn('[aparte-diff] the map of setupDiff threw:', error);
            return '';
        }
        if (input === null || input === undefined) return '';
        if (!drawable(input)) {
            if (!warned) {
                warned = true;
                console.warn(`[aparte-diff] the result of "${segment.toolCall?.name}" is not a diff it can show — check the map of setupDiff.`);
            }
            return '';
        }
        const element = document.createElement('aparte-diff') as HTMLElement & { diff: AparteDiffInput | null };
        element.diff = input;
        if (options.commentable) element.setAttribute('commentable', '');
        drawnFrom.set(element, from);
        return element;
    };

    const approvalPreview = (call: AparteToolCall): HTMLElement | null => {
        if (options.preview === false || typeof document === 'undefined') return null;
        const input = (call.input ?? {}) as Record<string, unknown>;
        let source: AparteDiffInput | null | undefined;
        try {
            source = options.preview ? options.preview(input, call) : previewFromInput(input);
        } catch (error) {
            console.warn('[aparte-diff] the preview of setupDiff threw:', error);
            return null;
        }
        if (source === null || source === undefined || !drawable(source)) return null;
        const element = document.createElement('aparte-diff') as HTMLElement & { diff: AparteDiffInput | null };
        element.diff = source;
        return element;
    };

    const own: Pick<AparteToolDisplay, 'details' | 'open' | 'approvalPreview'> = { details, open: options.open ?? true, approvalPreview };
    const restores = matchers.map((match) => {
        // What applies to the tool now. A tool with no entry of its own would get one here and
        // lose what a broader entry (`'*'`) said of it, so that is carried into it.
        const before = typeof match === 'string' ? config.getToolDisplay(match) : undefined;
        config.registerToolDisplay(match, { ...before, ...own });
        return () => {
            if (typeof match === 'string' && config.getToolDisplay(match)?.details !== details) return;
            if (before) config.registerToolDisplay(match, { details: before.details, open: before.open, approvalPreview: before.approvalPreview });
            else config.unregisterToolDisplay(match);
        };
    });

    let stopped = false;
    return () => {
        if (stopped) return;
        stopped = true;
        for (const restore of restores) restore();
    };
}
