/**
 * loadN8nHistory — a session's earlier messages, read back from the workflow's memory.
 *
 * n8n keeps the conversation, the page keeps nothing: after a reload, the Chat Trigger
 * answers `loadPreviousSession` with the session's messages as its memory node stored
 * them (LangChain's serialised messages). This turns them into messages a chat shows.
 */
import { AparteError, AparteErrorCode } from '@aparte/core';
import type { AparteMessage } from '@aparte/core';
import { httpError, unreachable } from './http.js';

export interface N8nHistoryOptions {
    /** The Chat Trigger's production URL, the one the runner sends to. */
    webhookUrl: string;
    /** The session to read: the one the runner sends the conversation's turns in. */
    sessionId: string;
    /** Sent as `metadata`, as the widget sends it with this request too. */
    metadata?: Record<string, unknown>;
    /** Sent with the request; a function is called for it. */
    headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
    /** @default the global `fetch` */
    fetch?: typeof fetch;
    /** For a workflow on another origin that authenticates by cookie. */
    credentials?: RequestCredentials;
    /** @default 'sessionId', the Chat Trigger's */
    chatSessionKey?: string;
    /** Cancels the request. */
    signal?: AbortSignal;
}

interface StoredMessage {
    id?: unknown;
    type?: unknown;
    kwargs?: { content?: unknown };
}

/** LangChain's message class, last segment of its `id` path (`['langchain_core','messages','AIMessage']`). */
function classOf(message: StoredMessage): string {
    const path = Array.isArray(message.id) ? message.id : [];
    const last = path[path.length - 1];
    return typeof last === 'string' ? last : typeof message.type === 'string' ? message.type : '';
}

/** Text content, or the text parts of a content list; a turn that only called a tool has none. */
function textOf(content: unknown): string {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
        .map((part) => (typeof part === 'string' ? part : typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'text' ? String((part as { text?: unknown }).text ?? '') : ''))
        .filter(Boolean)
        .join('\n\n');
}

/**
 * The messages a chat shows, from what the memory stored: what the person wrote and what
 * the agent answered. A tool's call and its result are left out, as the live stream
 * leaves them out — where n8n's widget drew them as bubbles of raw JSON after a reload.
 */
export function n8nHistoryToMessages(stored: unknown[], { now = Date.now() } = {}): AparteMessage[] {
    const messages: AparteMessage[] = [];
    stored.forEach((entry, index) => {
        if (typeof entry !== 'object' || entry === null) return;
        const message = entry as StoredMessage;
        const kind = classOf(message);
        const role = /^Human/.test(kind) || kind === 'human' ? 'user' : /^AI/.test(kind) || kind === 'ai' ? 'assistant' : undefined;
        if (!role) return;
        const content = textOf(message.kwargs?.content);
        if (!content.trim()) return;
        // Ordered, in the past: the memory keeps no time, and a chat sorts nothing by it.
        messages.push({ id: `n8n-${index}`, role, content, timestamp: now - (stored.length - index), status: 'completed' });
    });
    return messages;
}

/**
 * Read a session's earlier messages from the workflow's memory — for a page that keeps
 * the session id across reloads and shows the conversation again. Needs the Chat
 * Trigger's *Load Previous Session* set to *From Memory*; when it is off, n8n answers
 * with no messages.
 */
export async function loadN8nHistory(options: N8nHistoryOptions): Promise<AparteMessage[]> {
    const doFetch = options.fetch ?? fetch;
    const headers = typeof options.headers === 'function' ? await options.headers() : options.headers ?? {};
    const sent: Record<string, string> = { 'Content-Type': 'application/json' };
    for (const [name, value] of Object.entries(headers)) if (name.toLowerCase() !== 'content-type') sent[name] = value;
    const response = await doFetch(options.webhookUrl, {
        method: 'POST',
        headers: sent,
        body: JSON.stringify({
            action: 'loadPreviousSession',
            [options.chatSessionKey ?? 'sessionId']: options.sessionId,
            ...(options.metadata ? { metadata: options.metadata } : {}),
        }),
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.credentials ? { credentials: options.credentials } : {}),
    }).catch((error: unknown) => { throw unreachable(error, options.webhookUrl); });
    if (!response.ok) throw await httpError(response, 'history');
    let body: unknown;
    try {
        body = await response.json();
    } catch {
        throw new AparteError('n8n answered the history request with something that is not JSON. Check that the URL is the Chat Trigger\'s production URL.', AparteErrorCode.PROVIDER_MISCONFIGURED);
    }
    const data = typeof body === 'object' && body !== null ? (body as { data?: unknown }).data : undefined;
    return n8nHistoryToMessages(Array.isArray(data) ? data : []);
}
