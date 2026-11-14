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
import { aparteGlobalConfig, type AparteConfig, type AparteToolCallSegment, type AparteToolDisplay, type AparteToolMatcher } from '@aparte/core';
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
    /** Let the reader comment on its lines: `aparte-diff-comment` bubbles out of the chat. Off by default. */
    commentable?: boolean;
    /** Show the diff opened under the line (the default), or `false` for closed until the reader opens it. */
    open?: boolean;
}

/** The diffs drawn per setup, kept so a call drawn again from the same result is the same element. */
const KEPT_MAX = 200;

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

/** Whether `<aparte-diff>` can draw it: diff text that holds a file, a file's two texts, or a list of those. */
function drawable(value: unknown): value is AparteDiffInput {
    const one = (item: unknown): boolean => typeof item === 'object' && item !== null
        && ((typeof (item as { before?: unknown }).before === 'string' && typeof (item as { after?: unknown }).after === 'string')
            || Array.isArray((item as { hunks?: unknown }).hunks));
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
    const kept = new Map<string, { from: string; element: HTMLElement }>();
    let warned = false;

    const details = (segment: AparteToolCallSegment): HTMLElement | string => {
        if (segment.status !== 'resolved' || typeof document === 'undefined') return '';
        const raw = parseResult(segment);
        const from = fingerprint(raw);
        const known = kept.get(segment.id);
        // The same result drawn again (an update, a language switch): the element already there,
        // with what the reader opened and wrote in it.
        if (known && from && known.from === from) return known.element;
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
        kept.delete(segment.id);
        kept.set(segment.id, { from, element });
        if (kept.size > KEPT_MAX) kept.delete(kept.keys().next().value!);
        return element;
    };

    const own: Pick<AparteToolDisplay, 'details' | 'open'> = { details, open: options.open ?? true };
    const restores = matchers.map((match) => {
        // What applies to the tool now. A tool with no entry of its own would get one here and
        // lose what a broader entry (`'*'`) said of it, so that is carried into it.
        const before = typeof match === 'string' ? config.getToolDisplay(match) : undefined;
        config.registerToolDisplay(match, { ...before, ...own });
        return () => {
            if (typeof match === 'string' && config.getToolDisplay(match)?.details !== details) return;
            if (before) config.registerToolDisplay(match, { details: before.details, open: before.open });
            else config.unregisterToolDisplay(match);
        };
    });

    let stopped = false;
    return () => {
        if (stopped) return;
        stopped = true;
        for (const restore of restores) restore();
        kept.clear();
    };
}
