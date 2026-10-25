/**
 * createN8nRunner — an n8n chat workflow, drawn by aparté.
 *
 * The workflow's agent runs in n8n, with its model, its tools and its memory; n8n keeps
 * the conversation per session. So each turn sends what n8n's own widget sends — the
 * session, the message, the files — and the runner turns n8n's answer into the events
 * `AparteClient`'s adapter draws, the same ones a loop run in the page emits.
 */
import { AparteError, AparteErrorCode, contentToText, uuid } from '@aparte/core';
import type { AparteChatMessage, AparteStreamRunner, AparteStreamRunOptions } from '@aparte/core';
import { readN8nReply } from './wire.js';

export interface N8nRunnerOptions {
    /**
     * The workflow's chat URL: the Chat Trigger's production URL, the one that ends in
     * `/chat` — or a Webhook node's URL, for a workflow that answers through it.
     */
    webhookUrl: string;
    /**
     * The n8n session a turn runs in. n8n keeps the agent's memory per session, and the
     * page sends only the new message, so give the conversation's id when your app has
     * several conversations or keeps one across reloads; a function is read every turn.
     * @default one session for the runner's lifetime
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
     * know. For the developer, not the person chatting.
     * @default `console.warn`
     */
    onWarning?: (message: string) => void;
}

/** The workflow streamed nothing: the widget's own diagnosis, said to the developer. */
const EMPTY_REPLY = 'The n8n workflow answered with nothing. When its Chat Trigger streams, the node that answers '
    + 'has to stream too: turn on streaming in the AI Agent\'s options, or set the trigger\'s Response Mode to '
    + '"When Last Node Finishes".';

const PROXY_TIMEOUT = 'A proxy timed out waiting for n8n\'s answer. The workflow may still be running — '
    + 'its execution list shows the result.';

const DEFERRED = 'This n8n workflow answers through response nodes, over n8n\'s chat WebSocket, which this runner '
    + 'does not read. Set the Chat Trigger\'s Response Mode to "Streaming" or "When Last Node Finishes".';

/** The message the turn answers: the last one the person wrote. */
function lastUserMessage(messages: AparteChatMessage[]): AparteChatMessage | undefined {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i]?.role === 'user') return messages[i];
    return undefined;
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

/** An error n8n answered with: its `message` and `hint` when it sent JSON, else its text. */
async function httpError(response: Response): Promise<AparteError> {
    const text = (await response.text().catch(() => '')).trim();
    let message = text;
    try {
        const body = JSON.parse(text) as { message?: unknown; hint?: unknown };
        if (typeof body.message === 'string') message = typeof body.hint === 'string' ? `${body.message} ${body.hint}` : body.message;
    } catch { /* not JSON: its text */ }
    return new AparteError(
        message.slice(0, 300) || `The n8n workflow answered HTTP ${response.status}.`,
        AparteError.codeForStatus(response.status) ?? AparteErrorCode.PROVIDER_ERROR,
        undefined, undefined, response.status,
    );
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
    const ownSession = `aparte-${uuid()}`;

    return async (opts) => {
        const emit = opts.emitter;
        const doFetch = options.fetch ?? fetch;
        try {
            const headers = typeof options.headers === 'function' ? await options.headers() : options.headers ?? {};
            const sessionId = (typeof options.sessionId === 'function' ? options.sessionId(opts) : options.sessionId) ?? ownSession;
            const metadata = typeof options.metadata === 'function' ? options.metadata(opts) : options.metadata;
            const message = lastUserMessage((opts.baseRequest as { messages: AparteChatMessage[] }).messages);
            const chatInput = message ? contentToText(message.content) : '';
            const files = (Array.isArray(message?.content) ? message.content : [])
                .flatMap((part) => (part.type === 'image' ? [part] : []))
                .map((part, i) => imageFile(part.image, part.mimeType, i))
                .filter((file) => file !== undefined);

            // As n8n's widget sends it: JSON, or a form when the message carries files.
            const fields: Record<string, string | Record<string, unknown>> = {
                action: 'sendMessage',
                [sessionKey]: sessionId,
                [inputKey]: chatInput,
                ...(metadata ? { metadata } : {}),
            };
            let body: string | FormData;
            const requestHeaders: Record<string, string> = { Accept: 'text/plain', ...headers };
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
            });
            if (!response.ok) throw await httpError(response);

            emit({ type: 'run-start' });
            emit({ type: 'turn-start' });

            // n8n streams once per node that answers. One is drawn at a time, in the order
            // they began: another node's text waits for the drawn one to end, and starts a
            // block of its own below it.
            let drawn = false;
            let textOpen = false;
            let active: string | undefined;
            const waiting = new Map<string, { text: string[]; ended: boolean }>();
            const unknown = new Set<string>();
            const draw = (text: string) => {
                if (!text) return;
                drawn = true;
                textOpen = true;
                emit({ type: 'text-delta', delta: text });
            };
            const open = (stream: string) => {
                active = stream;
                if (textOpen) { emit({ type: 'text-flush' }); textOpen = false; }
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

            if (!response.body) throw new AparteError(EMPTY_REPLY, AparteErrorCode.PROVIDER_ERROR);
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
                        if (textOpen) emit({ type: 'text-flush' });
                        throw new AparteError(part.message || 'The n8n workflow failed.', AparteErrorCode.PROVIDER_ERROR);
                    case 'reply':
                        draw(part.text);
                        break;
                    case 'deferred':
                        throw new AparteError(DEFERRED, AparteErrorCode.PROVIDER_ERROR);
                    case 'html':
                        if (textOpen) emit({ type: 'text-flush' });
                        throw new AparteError(PROXY_TIMEOUT, AparteErrorCode.NET_TIMEOUT);
                    case 'unknown':
                        if (!unknown.has(part.type)) warn(`n8n sent a "${part.type}" frame, which this runner does not read; it was skipped.`);
                        unknown.add(part.type);
                        break;
                }
            }
            // A stream that was cut before its `end`: what it sent is still the answer.
            drain();
            if (!drawn) throw new AparteError(EMPTY_REPLY, AparteErrorCode.PROVIDER_ERROR);
            if (textOpen) emit({ type: 'text-flush' });
            emit({ type: 'run-done' });
            return undefined;
        } catch (error) {
            // Stopped by the person: not a failure, nothing to report.
            if (opts.signal.aborted) return undefined;
            throw error;
        }
    };
}
