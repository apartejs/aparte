/**
 * createN8nRunner — an n8n chat workflow, drawn by aparté.
 *
 * The workflow's agent runs in n8n, with its model, its tools and its memory; n8n keeps
 * the conversation per session. So each turn sends what n8n's own widget sends — the
 * session, the message, the files — and the runner turns n8n's answer into the events
 * `AparteClient`'s adapter draws, the same ones a loop run in the page emits.
 */
import { AparteError, AparteErrorCode, uuid } from '@aparte/core';
import type { AparteChatMessage, AparteStreamRunner, AparteStreamRunOptions } from '@aparte/core';
import { readN8nReply } from './wire.js';
import { httpError, unreachable } from './http.js';

export interface N8nRunnerOptions {
    /**
     * The workflow's chat URL: the Chat Trigger's production URL, the one that ends in
     * `/chat` — or a Webhook node's URL, for a workflow that answers through it.
     */
    webhookUrl: string;
    /**
     * The n8n session a turn runs in. n8n keeps the agent's memory per session and the
     * page sends only the new message, so this is what ties a conversation to its memory.
     * Give the id your app keeps for the conversation — the one you loaded its history
     * with ({@link loadN8nHistory}), or a conversation manager's `activeId`. A function
     * is read every turn.
     * @default a new session for each new conversation: a turn with no reply before it
     * starts one, and the turns after it continue it
     */
    sessionId?: string | ((opts: AparteStreamRunOptions) => string);
    /** Sent with every message as `metadata`, which the workflow reads from the trigger's output. */
    metadata?: Record<string, unknown> | ((opts: AparteStreamRunOptions) => Record<string, unknown>);
    /** Sent with every request; a function is called per request (a fresh token each time). */
    headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
    /** @default the global `fetch` */
    fetch?: typeof fetch;
    /** For a workflow on another origin that authenticates by cookie. */
    credentials?: RequestCredentials;
    /**
     * The body field that carries the session, for a workflow that reads another one.
     * @default 'sessionId', the Chat Trigger's
     */
    chatSessionKey?: string;
    /**
     * The body field that carries the message, for a workflow that reads another one.
     * @default 'chatInput', the Chat Trigger's
     */
    chatInputKey?: string;
    /**
     * Told what the runner could not read in n8n's answer — a frame type it does not
     * know, a stream cut mid-frame. For the developer, not the person chatting.
     * @default `console.warn`
     */
    onWarning?: (message: string) => void;
}

/** The workflow streamed nothing: the widget's own diagnosis, said to the developer. */
const EMPTY_STREAM = 'The n8n workflow streamed nothing. When its Chat Trigger streams, the node that answers '
    + 'has to stream too: turn on streaming in the AI Agent\'s options, or set the trigger\'s Response Mode to '
    + '"When Last Node Finishes".';

const EMPTY_WHOLE = 'The n8n workflow finished without an answer: its last node returned no text. End the '
    + 'workflow on the node that answers — an AI Agent, or a node that returns an `output` field.';

const PROXY_TIMEOUT = 'A proxy timed out waiting for n8n\'s answer. The workflow may still be running — '
    + 'its execution list shows the result.';

const DEFERRED = 'This n8n workflow answers through response nodes, over n8n\'s chat WebSocket, which this runner '
    + 'does not read. Set the Chat Trigger\'s Response Mode to "Streaming" or "When Last Node Finishes".';

const unreadable = (fields: string[]) => `The n8n workflow answered with the fields ${fields.map((f) => `"${f}"`).join(', ')} `
    + 'but no "output", "text" or "message" field, which is where a chat reads the answer. End the workflow on an AI Agent, '
    + 'or add a Set node that puts the reply in "output".';

/** The message the turn answers: the last one the person wrote. */
function lastUserIndex(messages: AparteChatMessage[]): number {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i]?.role === 'user') return i;
    return -1;
}

/** The text of a message, its parts kept apart: a file inlined after the words starts on a line of its own. */
function textOf(content: AparteChatMessage['content'] | undefined): string {
    if (content === undefined) return '';
    if (typeof content === 'string') return content;
    return content.flatMap((part) => (part.type === 'text' && part.text ? [part.text] : [])).join('\n\n');
}

const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

/**
 * An image part — a data URL — as the file the Chat Trigger receives. A `Blob` and a name
 * rather than a `File`, which Node only has from 20 and this package runs from 18.
 */
function imageFile(image: string, mimeType: string | undefined, index: number): { blob: Blob; name: string } | undefined {
    const match = /^data:([^;,]+)?((?:;[^;,]*)*?);base64,(.*)$/s.exec(image);
    if (!match) return undefined;
    const type = mimeType ?? match[1] ?? 'application/octet-stream';
    const binary = atob(match[3] ?? '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { blob: new Blob([bytes], { type }), name: `image-${index + 1}.${EXTENSIONS[type] ?? 'bin'}` };
}

/**
 * What the Chat Trigger receives as `files`: the files the person picked, whatever their
 * type, when the client hands them over (`files` on a send) — else the images inlined in
 * the message, for a caller that only has those.
 */
function filesOf(opts: AparteStreamRunOptions, message: AparteChatMessage | undefined): { blob: Blob; name: string }[] {
    if (opts.files && opts.files.length > 0) return opts.files.map((file) => ({ blob: file, name: file.name }));
    return (Array.isArray(message?.content) ? message.content : [])
        .flatMap((part) => (part.type === 'image' ? [part] : []))
        .map((part, i) => imageFile(part.image, part.mimeType, i))
        .filter((file) => file !== undefined);
}

/**
 * Put aparté on an n8n chat workflow: pass the result as `AparteClient`'s `streamRunner`.
 * n8n runs the agent, its tools and its memory; the page sends the person's message and
 * draws the answer, streamed when the Chat Trigger streams.
 */
export function createN8nRunner(options: N8nRunnerOptions): AparteStreamRunner {
    const warn = options.onWarning ?? ((message: string) => console.warn(`[aparte] n8n: ${message}`));
    const sessionKey = options.chatSessionKey ?? 'sessionId';
    const inputKey = options.chatInputKey ?? 'chatInput';
    let ownSession = `aparte-${uuid()}`;

    return async (opts) => {
        const emit = opts.emitter;
        const doFetch = options.fetch ?? fetch;
        try {
            const messages = (opts.baseRequest as { messages: AparteChatMessage[] }).messages;
            const last = lastUserIndex(messages);
            const message = last >= 0 ? messages[last] : undefined;
            // No reply before the message: a new conversation, or one that was cleared. n8n
            // must not answer it from the memory of the one before.
            if (options.sessionId === undefined && !messages.slice(0, Math.max(last, 0)).some((m) => m.role === 'assistant')) {
                ownSession = `aparte-${uuid()}`;
            }
            const headers = typeof options.headers === 'function' ? await options.headers() : options.headers ?? {};
            const sessionId = (typeof options.sessionId === 'function' ? options.sessionId(opts) : options.sessionId) ?? ownSession;
            const metadata = typeof options.metadata === 'function' ? options.metadata(opts) : options.metadata;
            const files = filesOf(opts, message);

            // As n8n's widget sends it: JSON, or a form when the message carries files.
            const fields: Record<string, string | Record<string, unknown>> = {
                action: 'sendMessage',
                [sessionKey]: sessionId,
                [inputKey]: textOf(message?.content),
                ...(metadata ? { metadata } : {}),
            };
            let body: string | FormData;
            // The page's headers, without a Content-Type in any case: a form's boundary is
            // the browser's to write, and JSON gets exactly one, ours.
            const requestHeaders: Record<string, string> = { Accept: 'text/plain' };
            for (const [name, value] of Object.entries(headers)) if (name.toLowerCase() !== 'content-type') requestHeaders[name] = value;
            if (files.length > 0) {
                const form = new FormData();
                for (const [key, value] of Object.entries(fields)) form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
                for (const file of files) form.append('files', file.blob, file.name);
                body = form;
            } else {
                body = JSON.stringify(fields);
                requestHeaders['Content-Type'] = 'application/json';
            }

            const response = await doFetch(options.webhookUrl, {
                method: 'POST',
                headers: requestHeaders,
                body,
                signal: opts.signal,
                ...(options.credentials ? { credentials: options.credentials } : {}),
            }).catch((error: unknown) => { throw unreachable(error, options.webhookUrl); });
            if (!response.ok) throw await httpError(response, 'answer');

            emit({ type: 'run-start' });
            emit({ type: 'turn-start' });

            // n8n streams once per node that answers. One is drawn at a time, in the order
            // they began: another node's text waits for the drawn one to end, and starts a
            // block of its own below it.
            let drawn = false;
            let whole = false;
            let textOpen = false;
            let active: string | undefined;
            const waiting = new Map<string, { text: string[]; ended: boolean }>();
            const unknown = new Set<string>();
            const flush = () => {
                if (textOpen) emit({ type: 'text-flush' });
                textOpen = false;
            };
            const draw = (text: string) => {
                if (!text) return;
                drawn = true;
                textOpen = true;
                emit({ type: 'text-delta', delta: text });
            };
            const open = (stream: string) => {
                active = stream;
                flush();
            };
            const drain = () => {
                active = undefined;
                for (const [stream, queued] of waiting) {
                    waiting.delete(stream);
                    open(stream);
                    for (const text of queued.text) draw(text);
                    if (!queued.ended) return;
                    active = undefined;
                }
            };
            const waitFor = (stream: string) => {
                let queued = waiting.get(stream);
                if (!queued) waiting.set(stream, queued = { text: [], ended: false });
                return queued;
            };

            if (!response.body) throw new AparteError(EMPTY_STREAM, AparteErrorCode.PROVIDER_ERROR);
            for await (const part of readN8nReply(response.body)) {
                switch (part.kind) {
                    case 'begin':
                        if (active === undefined) open(part.stream);
                        else if (part.stream !== active) waitFor(part.stream);
                        break;
                    case 'item':
                        if (part.stream === undefined || part.stream === active) draw(part.text);
                        else if (active === undefined) { open(part.stream); draw(part.text); }
                        else waitFor(part.stream).text.push(part.text);
                        break;
                    case 'end':
                        if (part.stream === active) drain();
                        else waitFor(part.stream).ended = true;
                        break;
                    case 'error':
                        flush();
                        throw new AparteError(part.message || 'The n8n workflow failed.', AparteErrorCode.PROVIDER_ERROR);
                    case 'reply':
                        whole = true;
                        draw(part.text);
                        break;
                    case 'unreadable':
                        throw new AparteError(unreadable(part.fields), AparteErrorCode.PROVIDER_ERROR);
                    case 'deferred':
                        throw new AparteError(DEFERRED, AparteErrorCode.PROVIDER_ERROR);
                    case 'html':
                        flush();
                        throw new AparteError(PROXY_TIMEOUT, AparteErrorCode.NET_TIMEOUT);
                    case 'cut':
                        warn('n8n\'s stream stopped in the middle of a frame; the text before it is kept.');
                        break;
                    case 'unknown':
                        if (!unknown.has(part.type)) warn(`n8n sent a "${part.type}" frame, which this runner does not read; it was skipped.`);
                        unknown.add(part.type);
                        break;
                }
            }
            // A stream that was cut before its `end`: what it sent is still the answer — all
            // of it, the streams still waiting included, ended or not.
            drain();
            for (const [stream, queued] of waiting) {
                waiting.delete(stream);
                open(stream);
                for (const text of queued.text) draw(text);
            }
            if (!drawn) throw new AparteError(whole ? EMPTY_WHOLE : EMPTY_STREAM, AparteErrorCode.PROVIDER_ERROR);
            flush();
            emit({ type: 'run-done' });
            return undefined;
        } catch (error) {
            // Stopped by the person: not a failure, nothing to report.
            if (opts.signal.aborted) return undefined;
            throw error;
        }
    };
}
