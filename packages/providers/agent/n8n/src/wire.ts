/**
 * The body of n8n's answer to a chat message, read as it arrives.
 *
 * Two shapes come back, both labelled `application/json` by n8n:
 * - **streamed** — a Chat Trigger (or Webhook node) whose Response Mode is *Streaming*
 *   sends newline-delimited JSON frames, `begin` / `item` / `end` per node that streams,
 *   `error` when the workflow fails, and `keepalive` every 30 seconds while nothing else
 *   comes — so before the first `begin` when a slow node runs first;
 * - **whole** — any other Response Mode sends one value once the workflow ends: the last
 *   node's item (`{ output }` for an AI Agent), or what a *Respond to Webhook* node sent.
 *
 * Which one it is shows on the first line: a frame has a known `type`. Read off
 * `@n8n/chat` 1.43.3, the widget n8n embeds, and recorded against n8n 2.35.7 and 2.44.6.
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
    /** A whole answer that is JSON with none of the fields a chat reads; its field names. */
    | { kind: 'unreadable'; fields: string[] }
    /** The workflow answers later, through response nodes over n8n's chat WebSocket. */
    | { kind: 'deferred' }
    /** An HTML page instead of the answer: a proxy gave up waiting. */
    | { kind: 'html' }
    /** The stream stopped in the middle of a frame. */
    | { kind: 'cut' };

const FRAME_TYPES = new Set(['begin', 'item', 'end', 'error', 'keepalive']);

/**
 * A frame: one of the known types, or a newer type that carries n8n's `metadata` with a
 * `nodeId`. A whole answer can be any JSON, so a bare `type` is not enough.
 */
function opensStream(value: unknown): boolean {
    if (!isFrame(value)) return false;
    if (FRAME_TYPES.has(value.type)) return true;
    const metadata = value.metadata;
    return typeof metadata === 'object' && metadata !== null && typeof metadata['nodeId'] === 'string';
}

/**
 * A proxy's error page: text that STARTS as HTML. An answer that merely contains markup —
 * an agent asked for a snippet — is not one, which is why this is a prefix test.
 */
function isHtml(text: string): boolean {
    return /^\s*<(?:!doctype|html|head|body)[\s>]/i.test(text);
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

function frameToPart(frame: { type: string; content?: unknown; metadata?: Record<string, unknown> }): N8nReplyPart | undefined {
    switch (frame.type) {
        case 'begin': return { kind: 'begin', stream: streamOf(frame) };
        case 'item': return { kind: 'item', stream: streamOf(frame), text: typeof frame.content === 'string' ? frame.content : '' };
        case 'end': return { kind: 'end', stream: streamOf(frame) };
        case 'error': return { kind: 'error', message: typeof frame.content === 'string' ? frame.content : '' };
        // n8n's heartbeat: it says the workflow is still running, nothing to draw.
        case 'keepalive': return undefined;
        default: return { kind: 'unknown', type: frame.type };
    }
}

/**
 * The text of a whole answer, the way n8n's widget reads it: `output`, else `text`, else
 * `message`; a `{ type: 'text', text }` part as its text. `undefined` when the value has
 * none of them — where the widget printed the JSON into the bubble, the most asked-about
 * failure on n8n's forum, this lets the runner say which field is missing instead.
 */
export function replyText(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
        const texts = value.map(replyText);
        return texts.every((t) => t === undefined) && value.length > 0 ? undefined : texts.filter((t) => t !== undefined).join('\n\n');
    }
    if (typeof value !== 'object' || value === null) return value === null || value === undefined ? '' : String(value);
    const record = value as Record<string, unknown>;
    const key = ['output', 'text', 'message'].find((k) => record[k] !== undefined && record[k] !== null);
    if (key === undefined) return Object.keys(record).length > 0 ? undefined : '';
    const text = record[key];
    if (typeof text === 'string') return text;
    if (typeof text === 'object' && text !== null && (text as { type?: unknown }).type === 'text' && typeof (text as { text?: unknown }).text === 'string') {
        return (text as { text: string }).text;
    }
    return typeof text === 'number' || typeof text === 'boolean' ? String(text) : undefined;
}

/**
 * The field names a whole answer carried, to name them in the error: the first item's, for
 * a list. Called only for a value `replyText` could not read, which always holds a record.
 */
function fieldsOf(value: unknown): string[] {
    let record = value;
    while (Array.isArray(record)) record = record[0];
    return Object.keys(record as object).slice(0, 6);
}

function wholePart(raw: string): N8nReplyPart | undefined {
    const text = raw.trim();
    if (!text) return undefined;
    // Parsed first: a JSON answer is an answer, whatever markup its text holds.
    const value = parse(text);
    if (value === undefined) return isHtml(text) ? { kind: 'html' } : { kind: 'reply', text: raw };
    if (typeof value === 'object' && value !== null && (value as { executionStarted?: unknown }).executionStarted === true) return { kind: 'deferred' };
    const reply = replyText(value);
    return reply === undefined ? { kind: 'unreadable', fields: fieldsOf(value) } : { kind: 'reply', text: reply };
}

/** Yields what n8n's answer carries, frame by frame as it streams, or once for a whole answer. */
export async function* readN8nReply(body: ReadableStream<Uint8Array>): AsyncGenerator<N8nReplyPart> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    // Widened on purpose: `lines` below decides it, a closure TypeScript's narrowing does not follow.
    let mode = 'unknown' as 'unknown' | 'frames' | 'whole';
    let raw = '';
    let pending = '';

    function* lines(text: string, last: boolean): Generator<N8nReplyPart> {
        const all = text.split('\n');
        for (const [i, line] of all.entries()) {
            if (!line.trim()) continue;
            const value = parse(line);
            if (mode === 'unknown') {
                if (!opensStream(value)) { mode = 'whole'; return; }
                mode = 'frames';
            }
            if (isFrame(value)) {
                const part = frameToPart(value);
                if (part) yield part;
            } else if (last && i === all.length - 1 && line.trimStart().startsWith('{')) {
                // The body ended inside a frame: what came before it stands, the fragment does not.
                yield { kind: 'cut' };
            } else if (isHtml(line)) {
                yield { kind: 'html' };
            } else {
                // A line that is not a frame is text, as the widget reads it.
                yield { kind: 'item', text: line };
            }
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
                yield* lines(complete, done);
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
