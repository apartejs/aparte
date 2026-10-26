/**
 * n8n's chat WebSocket — how a workflow that answers through response nodes (Chat nodes,
 * "Using Response Nodes" on the Chat Trigger) talks to the page.
 *
 * Recorded against n8n 2.44.7 rather than read from documentation, which has none: the
 * message that starts the execution is answered `{ executionStarted, executionId,
 * resumeToken }`, the page opens `/chat?sessionId&executionId&isPublic=true&token`, and the
 * socket then carries, in this order for a Chat node that sends and then one that asks:
 *
 *   "n8n|heartbeat"                       answered "n8n|heartbeat-ack"
 *   "Hello! You said: hi"                 a message, as plain text
 *   "n8n|continue"                        the execution goes on: more is coming
 *   {"type":"with-buttons", text, buttons:[{ text, link, type }], blockUserInput}
 *
 * A button's link resumes the execution when fetched (a GET), and the next messages come on
 * the same socket. A Chat node that waits for a written reply is answered on the socket
 * too, as JSON. n8n 3.0 moves the bare `n8n|…` strings to JSON (`{ type: 'heartbeat' }`,
 * `{ type: 'continue' }`, `{ type: 'message', text }`); both are read.
 */

/** A button of a Chat node that waits for an approval. */
export interface N8nChatButton {
    text: string;
    /** The URL that resumes the waiting execution with this answer. */
    link: string;
    /** n8n's style: `primary` or `secondary`. */
    type: string;
}

export type N8nSocketFrame =
    | { kind: 'text'; text: string }
    | { kind: 'continue' }
    | { kind: 'buttons'; text: string; buttons: N8nChatButton[]; blockUserInput: boolean }
    | { kind: 'error'; message: string }
    | { kind: 'closed' };

/** The socket a deferred execution talks on, from the workflow's chat URL. */
export function chatSocketUrl(webhookUrl: string, sessionId: string, executionId: string, token?: string): string {
    const origin = new URL(webhookUrl).origin.replace(/^http/, 'ws');
    const params = new URLSearchParams({ sessionId, executionId, isPublic: 'true' });
    if (token) params.set('token', token);
    return `${origin}/chat?${params.toString()}`;
}

/** One frame as text, read the way n8n's own widget reads it. */
export function readSocketFrame(data: string): N8nSocketFrame | 'heartbeat' | 'heartbeat-json' {
    if (data === 'n8n|heartbeat') return 'heartbeat';
    if (data === 'n8n|continue') return { kind: 'continue' };
    let value: unknown;
    try { value = JSON.parse(data); } catch { return { kind: 'text', text: data }; }
    if (typeof value !== 'object' || value === null) return { kind: 'text', text: data };
    const frame = value as { type?: unknown; text?: unknown; message?: unknown; buttons?: unknown; blockUserInput?: unknown };
    switch (frame.type) {
        case 'heartbeat': return 'heartbeat-json';
        case 'continue': return { kind: 'continue' };
        case 'message': return { kind: 'text', text: typeof frame.text === 'string' ? frame.text : '' };
        case 'error': return { kind: 'error', message: typeof frame.message === 'string' ? frame.message : '' };
        case 'with-buttons': {
            const buttons = (Array.isArray(frame.buttons) ? frame.buttons : [])
                .filter((b): b is N8nChatButton => typeof b === 'object' && b !== null
                    && typeof (b as N8nChatButton).text === 'string' && typeof (b as N8nChatButton).link === 'string')
                .map((b) => ({ text: b.text, link: b.link, type: typeof b.type === 'string' ? b.type : 'primary' }));
            return { kind: 'buttons', text: typeof frame.text === 'string' ? frame.text : '', buttons, blockUserInput: frame.blockUserInput === true };
        }
        default: return { kind: 'text', text: data };
    }
}

/** The constructor the runner opens sockets with: the browser's, or one a test gives. */
export type N8nWebSocketLike = new (url: string) => {
    readonly readyState: number;
    send(data: string): void;
    close(): void;
    onopen: ((event: unknown) => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onclose: ((event: unknown) => void) | null;
    onerror: ((event: unknown) => void) | null;
};

const OPEN = 1;

/**
 * One execution's socket: frames queue until a turn reads them, so a message that arrives
 * between two turns — after a button, before the page resumed — is not lost.
 */
export class N8nChatSocket {
    closed = false;
    private readonly socket: InstanceType<N8nWebSocketLike>;
    private readonly queue: N8nSocketFrame[] = [];
    private waiter: ((frame: N8nSocketFrame) => void) | undefined;
    private readonly opened: Promise<void>;

    constructor(url: string, Socket: N8nWebSocketLike) {
        this.socket = new Socket(url);
        this.opened = new Promise((resolve) => {
            this.socket.onopen = () => resolve();
        });
        this.socket.onmessage = (event) => {
            const read = readSocketFrame(String(event.data));
            if (read === 'heartbeat') this.socket.send('n8n|heartbeat-ack');
            else if (read === 'heartbeat-json') this.socket.send(JSON.stringify({ type: 'heartbeat-ack' }));
            else this.push(read);
        };
        // An error is followed by a close, which is the one that says it is over.
        this.socket.onerror = () => undefined;
        this.socket.onclose = () => {
            this.closed = true;
            this.push({ kind: 'closed' });
        };
    }

    private push(frame: N8nSocketFrame): void {
        const waiter = this.waiter;
        this.waiter = undefined;
        if (waiter) waiter(frame);
        else this.queue.push(frame);
    }

    /** Put a frame back in front, read too early. */
    unshift(frame: N8nSocketFrame): void {
        this.queue.unshift(frame);
    }

    /**
     * The next frame, waited for; `'timeout'` when `timeoutMs` passes first, `undefined`
     * when the signal fires. A closed socket answers `closed` from then on.
     */
    next(signal: AbortSignal, timeoutMs?: number): Promise<N8nSocketFrame | 'timeout' | undefined> {
        const queued = this.queue.shift();
        if (queued) return Promise.resolve(queued);
        if (this.closed) return Promise.resolve({ kind: 'closed' });
        if (signal.aborted) return Promise.resolve(undefined);
        return new Promise((resolve) => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const done = (value: N8nSocketFrame | 'timeout' | undefined) => {
                if (timer !== undefined) clearTimeout(timer);
                signal.removeEventListener('abort', onAbort);
                if (this.waiter === settle) this.waiter = undefined;
                resolve(value);
            };
            const settle = (frame: N8nSocketFrame) => done(frame);
            const onAbort = () => done(undefined);
            this.waiter = settle;
            signal.addEventListener('abort', onAbort, { once: true });
            if (timeoutMs !== undefined) timer = setTimeout(() => done('timeout'), timeoutMs);
        });
    }

    /** Send a message on the socket, once it is open. */
    async send(message: Record<string, unknown>): Promise<void> {
        if (this.socket.readyState !== OPEN) await this.opened;
        this.socket.send(JSON.stringify(message));
    }

    close(): void {
        this.socket.close();
    }
}
