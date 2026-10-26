/**
 * createN8nRunner — an n8n chat workflow, drawn by aparté.
 *
 * The workflow's agent runs in n8n, with its model, its tools and its memory; n8n keeps
 * the conversation per session. So each turn sends what n8n's own widget sends — the
 * session, the message, the files — and the runner turns n8n's answer into the events
 * `AparteClient`'s adapter draws, the same ones a loop run in the page emits.
 */
import { AparteError, AparteErrorCode, uuid } from '@aparte/core';
import type { AparteChatMessage, AparteStreamRunEvent, AparteStreamRunner, AparteStreamRunOptions } from '@aparte/core';
import { readN8nReply } from './wire.js';
import { httpError, unreachable } from './http.js';
import { N8nChatSocket, chatSocketUrl } from './socket.js';
import type { N8nWebSocketLike } from './socket.js';
import { N8N_BUTTONS_TOOL } from './buttons.js';
import type { N8nButtonsInput, N8nButtonsResult } from './buttons.js';

type Suspended = Extract<AparteStreamRunEvent, { type: 'run-suspended' }>;

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
    /**
     * What a workflow that answers through response nodes is read with: n8n's chat
     * WebSocket. Given for a runtime without a global one, or a test.
     * @default the global `WebSocket`
     */
    WebSocket?: N8nWebSocketLike;
}

/** What a paused turn hands the page, and gets back with the button chosen. */
interface Ticket {
    v: 1;
    sessionId: string;
    executionId: string;
    token?: string;
    toolCallId: string;
    /** The buttons' links, in the order the page was given the buttons. */
    links: string[];
}

function readTicket(token: string | undefined): Ticket | undefined {
    if (!token) return undefined;
    try {
        const ticket = JSON.parse(token) as Partial<Ticket>;
        return ticket.v === 1 && typeof ticket.sessionId === 'string' && typeof ticket.executionId === 'string'
            && typeof ticket.toolCallId === 'string' && Array.isArray(ticket.links) ? ticket as Ticket : undefined;
    } catch {
        return undefined;
    }
}

/**
 * How long a message is given to be followed by `continue`. n8n sends it in the same tick
 * as the message when the execution goes on (recorded on 2.44.7: both at +3172 ms); a
 * message with nothing behind it is one the execution waits after, for the person.
 */
const CONTINUE_GRACE_MS = 250;

/** A file as n8n's widget sends it on the socket: a data URL. */
async function dataUrl(file: { blob: Blob; name: string }): Promise<{ name: string; type: string; data: string }> {
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    const type = file.blob.type || 'application/octet-stream';
    return { name: file.name, type, data: `data:${type};base64,${btoa(binary)}` };
}

/** The workflow streamed nothing: the widget's own diagnosis, said to the developer. */
const EMPTY_STREAM = 'The n8n workflow streamed nothing. When its Chat Trigger streams, the node that answers '
    + 'has to stream too: turn on streaming in the AI Agent\'s options, or set the trigger\'s Response Mode to '
    + '"When Last Node Finishes".';

const EMPTY_WHOLE = 'The n8n workflow finished without an answer: its last node returned no text. End the '
    + 'workflow on the node that answers — an AI Agent, or a node that returns an `output` field.';

const PROXY_TIMEOUT = 'A proxy timed out waiting for n8n\'s answer. The workflow may still be running — '
    + 'its execution list shows the result.';

const DEFERRED = 'This n8n workflow answers through response nodes, over n8n\'s chat WebSocket, and n8n did not say '
    + 'which execution to listen to. Check the Chat Trigger\'s Response Mode.';

const NO_WEBSOCKET = 'This n8n workflow answers through response nodes, over n8n\'s chat WebSocket, and this runtime has '
    + 'no WebSocket. Pass one as the runner\'s `WebSocket` option.';

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
    // One socket per session while its execution runs: the turns after it — a written
    // reply to a Chat node that waits for one, a button's answer — go on it.
    const sockets = new Map<string, { socket: N8nChatSocket; executionId: string; token?: string }>();

    const openSocket = (sessionId: string, executionId: string, token?: string) => {
        const Socket = options.WebSocket ?? (globalThis as { WebSocket?: N8nWebSocketLike }).WebSocket;
        if (!Socket) throw new AparteError(NO_WEBSOCKET, AparteErrorCode.PROVIDER_MISCONFIGURED);
        sockets.get(sessionId)?.socket.close();
        const entry = { socket: new N8nChatSocket(chatSocketUrl(options.webhookUrl, sessionId, executionId, token), Socket), executionId, ...(token ? { token } : {}) };
        sockets.set(sessionId, entry);
        return entry;
    };

    /**
     * Read the execution's socket for this turn: each message a block of its own, until the
     * execution stops to wait — for a written reply, or on buttons, which pause the turn for
     * the page — or ends.
     */
    const listen = async (opts: AparteStreamRunOptions, sessionId: string): Promise<void> => {
        const emit = opts.emitter;
        const entry = sockets.get(sessionId)!;
        const { socket } = entry;
        let drawn = false;
        const finish = () => {
            if (drawn) emit({ type: 'text-flush' });
            emit({ type: 'run-done' });
        };
        for (;;) {
            const frame = await socket.next(opts.signal);
            if (frame === undefined) return;
            if (frame === 'timeout' || frame.kind === 'continue') continue;
            switch (frame.kind) {
                case 'text': {
                    if (drawn) emit({ type: 'text-flush' });
                    if (frame.text) {
                        emit({ type: 'text-delta', delta: frame.text });
                        drawn = true;
                    }
                    const after = await socket.next(opts.signal, CONTINUE_GRACE_MS);
                    if (after === undefined) return;
                    if (after === 'timeout') return finish();
                    if (after.kind !== 'continue') socket.unshift(after);
                    break;
                }
                case 'buttons': {
                    if (drawn) emit({ type: 'text-flush' });
                    if (frame.text) {
                        emit({ type: 'text-delta', delta: frame.text });
                        emit({ type: 'text-flush' });
                    }
                    // As n8n's widget: only a button that leads back to this n8n is shown —
                    // a link elsewhere would have the page fetch whatever a workflow wrote.
                    const origin = new URL(options.webhookUrl).origin;
                    const buttons = frame.buttons.filter((b) => {
                        try { return new URL(b.link, options.webhookUrl).origin === origin; } catch { return false; }
                    });
                    if (buttons.length === 0) {
                        warn('An n8n Chat node sent buttons whose links lead off this n8n instance; they were not shown.');
                        emit({ type: 'run-done' });
                        return;
                    }
                    const toolCallId = `n8n-buttons-${uuid()}`;
                    const input: N8nButtonsInput = {
                        text: frame.text,
                        buttons: buttons.map((b) => ({ text: b.text, type: b.type })),
                        blockUserInput: frame.blockUserInput,
                    };
                    const ticket: Ticket = {
                        v: 1, sessionId, executionId: entry.executionId, ...(entry.token ? { token: entry.token } : {}),
                        toolCallId, links: buttons.map((b) => b.link),
                    };
                    emit({ type: 'tool-start', toolCallId, name: N8N_BUTTONS_TOOL, input });
                    emit({
                        type: 'run-suspended',
                        pending: [{ toolCallId, name: N8N_BUTTONS_TOOL, input, reason: 'external' }],
                        ticket: JSON.stringify(ticket),
                    } as Suspended);
                    return;
                }
                case 'error':
                    if (drawn) emit({ type: 'text-flush' });
                    throw new AparteError(frame.message || 'The n8n workflow failed.', AparteErrorCode.PROVIDER_ERROR);
                case 'closed':
                    // The execution ended: the next message starts a new one.
                    sockets.delete(sessionId);
                    return finish();
            }
        }
    };

    /** The page answered a Chat node's buttons: n8n hears it through the button's link. */
    const resume = async (opts: AparteStreamRunOptions, ticket: Ticket, doFetch: typeof fetch): Promise<void> => {
        const emit = opts.emitter;
        emit({ type: 'run-start' });
        emit({ type: 'turn-start' });
        const outcome = opts.deferral?.outcomes?.[ticket.toolCallId];
        const chosen = outcome?.kind === 'result' ? (outcome.structuredContent as N8nButtonsResult | undefined) : undefined;
        const link = chosen ? ticket.links[chosen.index] : undefined;
        // Words of the person's own instead of a button: n8n hears them as a chat message,
        // which the waiting Chat node resumes on as not approved.
        if (outcome?.kind === 'result' && chosen?.written) {
            emit({ type: 'tool-resolved', toolCallId: ticket.toolCallId, result: outcome.content, structuredResult: chosen });
            const entry = sockets.get(ticket.sessionId) ?? openSocket(ticket.sessionId, ticket.executionId, ticket.token);
            await entry.socket.send({ sessionId: ticket.sessionId, action: 'sendMessage', chatInput: chosen.text, files: [] });
            await listen(opts, ticket.sessionId);
            return;
        }
        if (!outcome || outcome.kind !== 'result' || !link) {
            // No button: the execution keeps waiting in n8n, and a written message answers it.
            emit({ type: 'tool-aborted', toolCallId: ticket.toolCallId });
            emit({ type: 'run-done' });
            return;
        }
        emit({ type: 'tool-resolved', toolCallId: ticket.toolCallId, result: outcome.content, structuredResult: chosen });
        // The socket the buttons came on, or a new one on the same execution if it closed.
        const entry = sockets.get(ticket.sessionId);
        if (!entry || entry.socket.closed) openSocket(ticket.sessionId, ticket.executionId, ticket.token);
        const response = await doFetch(link, {
            signal: opts.signal,
            ...(options.credentials ? { credentials: options.credentials } : {}),
        }).catch((error: unknown) => { throw unreachable(error, link); });
        if (!response.ok) throw await httpError(response, 'answer');
        await listen(opts, ticket.sessionId);
    };

    return async (opts) => {
        const emit = opts.emitter;
        const doFetch = options.fetch ?? fetch;
        try {
            const ticket = readTicket(opts.deferral?.token);
            if (ticket) {
                await resume(opts, ticket, doFetch);
                return undefined;
            }
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

            // An execution that waits for the person's written reply hears it on its socket.
            const execution = sockets.get(sessionId);
            if (execution && !execution.socket.closed) {
                emit({ type: 'run-start' });
                emit({ type: 'turn-start' });
                await execution.socket.send({
                    sessionId,
                    action: 'sendMessage',
                    chatInput: textOf(message?.content),
                    files: await Promise.all(files.map(dataUrl)),
                });
                await listen(opts, sessionId);
                return undefined;
            }

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
            let deferred = false;
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

            if (!response.body) throw new AparteError(EMPTY_STREAM, AparteErrorCode.PROVIDER_MISCONFIGURED);
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
                        throw new AparteError(unreadable(part.fields), AparteErrorCode.PROVIDER_MISCONFIGURED);
                    case 'deferred':
                        // Response nodes: the answer comes on n8n's chat socket.
                        if (!part.executionId) throw new AparteError(DEFERRED, AparteErrorCode.PROVIDER_MISCONFIGURED);
                        openSocket(sessionId, part.executionId, part.resumeToken);
                        deferred = true;
                        break;
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
            if (deferred) {
                await listen(opts, sessionId);
                return undefined;
            }
            // A stream that was cut before its `end`: what it sent is still the answer — all
            // of it, the streams still waiting included, ended or not.
            drain();
            for (const [stream, queued] of waiting) {
                waiting.delete(stream);
                open(stream);
                for (const text of queued.text) draw(text);
            }
            if (!drawn) throw new AparteError(whole ? EMPTY_WHOLE : EMPTY_STREAM, AparteErrorCode.PROVIDER_MISCONFIGURED);
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
