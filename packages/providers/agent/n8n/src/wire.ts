/**
 * The body of n8n's answer to a chat message, read as it arrives.
 *
 * Two shapes come back, both labelled `application/json` by n8n:
 * - **streamed** — a Chat Trigger (or Webhook node) whose Response Mode is *Streaming*
 *   sends newline-delimited JSON frames, `begin` / `item` / `end` per node that streams,
 *   and `error` when the workflow fails;
 * - **whole** — any other Response Mode sends one value once the workflow ends: the last
 *   node's item (`{ output }` for an AI Agent), or what a *Respond to Webhook* node sent.
 *
 * Which one it is shows on the first line: a frame has a `type`. Read off `@n8n/chat`
 * 1.43.3, the widget n8n embeds, and recorded against n8n 2.35.7.
 */

/** One thing an answer carries, in order. */
export type N8nReplyPart =
    /** A node starts streaming. `stream` names it (node, run, item). */
    | { kind: 'begin'; stream: string }
    /** A piece of text. `stream` is absent for a line that was not a frame. */
    | { kind: 'item'; stream?: string; text: string }
    | { kind: 'end'; stream: string }
    /** The workflow failed; its message. */
    | { kind: 'error'; message: string }
    /** A frame type this reader does not know (a newer n8n). */
    | { kind: 'unknown'; type: string }
    /** The whole answer of a workflow that does not stream. */
    | { kind: 'reply'; text: string }
    /** The workflow answers later, through response nodes over n8n's chat WebSocket. */
    | { kind: 'deferred' }
    /** An HTML page instead of the answer: a proxy gave up waiting. */
    | { kind: 'html' };

const FRAME_TYPES = new Set(['begin', 'item', 'end', 'error']);

/** A frame: one of the four types, or any type with n8n's `metadata` (a newer frame). */
function opensStream(value: unknown): boolean {
    if (!isFrame(value)) return false;
    return FRAME_TYPES.has(value.type) || (typeof value.metadata === 'object' && value.metadata !== null);
}

/** The widget's own test for a proxy's error page. */
function isHtml(text: string): boolean {
    return text.includes('<!DOCTYPE') || text.includes('<html') || text.includes('</html>');
}

function parse(line: string): unknown {
    try { return JSON.parse(line); } catch { return undefined; }
}

function isFrame(value: unknown): value is { type: string; content?: unknown; metadata?: Record<string, unknown> } {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && typeof (value as { type?: unknown }).type === 'string';
}

/** Which node's stream a frame belongs to: n8n streams one per node, run and item. */
function streamOf(frame: { metadata?: Record<string, unknown> }): string {
    const m = frame.metadata ?? {};
    return `${String(m['nodeId'] ?? '')}:${String(m['runIndex'] ?? 0)}:${String(m['itemIndex'] ?? 0)}`;
}

function frameToPart(frame: { type: string; content?: unknown; metadata?: Record<string, unknown> }): N8nReplyPart {
    switch (frame.type) {
        case 'begin': return { kind: 'begin', stream: streamOf(frame) };
        case 'item': return { kind: 'item', stream: streamOf(frame), text: typeof frame.content === 'string' ? frame.content : '' };
        case 'end': return { kind: 'end', stream: streamOf(frame) };
        case 'error': return { kind: 'error', message: typeof frame.content === 'string' ? frame.content : '' };
        default: return { kind: 'unknown', type: frame.type };
    }
}

/**
 * The text of a whole answer, the way n8n's widget reads it: `output`, else `text`, else
 * `message`; a `{ type: 'text', text }` part as its text; anything else as JSON, so a
 * workflow ending on a node that is not an agent still shows what it returned. An empty
 * `output` is an empty answer, where the widget printed `{ "output": "" }`.
 */
export function replyText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(replyText).join('\n\n');
    if (typeof value !== 'object' || value === null) return value === null || value === undefined ? '' : String(value);
    const record = value as Record<string, unknown>;
    const key = ['output', 'text', 'message'].find((k) => record[k] !== undefined && record[k] !== null);
    const text = key === undefined ? undefined : record[key];
    if (typeof text === 'string') return text;
    if (typeof text === 'object' && text !== null && (text as { type?: unknown }).type === 'text' && typeof (text as { text?: unknown }).text === 'string') {
        return (text as { text: string }).text;
    }
    return Object.keys(record).length > 0 ? JSON.stringify(record, null, 2) : '';
}

function wholePart(raw: string): N8nReplyPart | undefined {
    const text = raw.trim();
    if (!text) return undefined;
    if (isHtml(text)) return { kind: 'html' };
    const value = parse(text);
    if (value === undefined) return { kind: 'reply', text: raw };
    if (typeof value === 'object' && value !== null && (value as { executionStarted?: unknown }).executionStarted === true) return { kind: 'deferred' };
    return { kind: 'reply', text: replyText(value) };
}

/** Yields what n8n's answer carries, frame by frame as it streams, or once for a whole answer. */
export async function* readN8nReply(body: ReadableStream<Uint8Array>): AsyncGenerator<N8nReplyPart> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    // Widened on purpose: `lines` below decides it, a closure TypeScript's narrowing does not follow.
    let mode = 'unknown' as 'unknown' | 'frames' | 'whole';
    let raw = '';
    let pending = '';

    function* lines(text: string): Generator<N8nReplyPart> {
        for (const line of text.split('\n')) {
            if (!line.trim()) continue;
            const value = parse(line);
            if (mode === 'unknown') {
                if (!opensStream(value)) { mode = 'whole'; return; }
                mode = 'frames';
            }
            if (isFrame(value)) yield frameToPart(value);
            else if (isHtml(line)) yield { kind: 'html' };
            // A line that is not a frame is text, as the widget reads it.
            else yield { kind: 'item', text: line };
        }
    }

    try {
        for (;;) {
            const { done, value } = await reader.read();
            const chunk = done ? decoder.decode() : decoder.decode(value, { stream: true });
            raw += chunk;
            if (mode !== 'whole') {
                pending += chunk;
                const cut = done ? pending.length : pending.lastIndexOf('\n') + 1;
                const complete = pending.slice(0, cut);
                pending = pending.slice(cut);
                yield* lines(complete);
            }
            if (done) break;
        }
    } finally {
        reader.releaseLock();
    }
    if (mode !== 'frames') {
        const part = wholePart(raw);
        if (part) yield part;
    }
}
