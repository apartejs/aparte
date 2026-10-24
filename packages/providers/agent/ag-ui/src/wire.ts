/**
 * The AG-UI wire, as much of it as aparté reads — typed here rather than taken from
 * `@ag-ui/core`, whose client pulls rxjs, zod and protobuf into a bundle that only
 * needs to read JSON lines. Field names follow the protocol (docs.ag-ui.com, 1.0).
 */

/** An interrupt an agent ends its run on (`RUN_FINISHED.outcome`). */
export interface AgUiInterrupt {
    id: string;
    /** `tool_call`, `confirmation`, `input_required`, or a producer's own string. */
    reason: string;
    message?: string;
    toolCallId?: string;
    responseSchema?: unknown;
    metadata?: Record<string, unknown>;
}

/** The events the runner maps; any other `type` is read and ignored. */
export type AgUiEvent =
    | { type: 'RUN_STARTED'; threadId?: string; runId?: string }
    | {
        type: 'RUN_FINISHED';
        threadId?: string;
        runId?: string;
        outcome?: { type: 'success' } | { type: 'interrupt'; interrupts: AgUiInterrupt[] };
        /** TanStack AI reports usage here, as an array. */
        usage?: unknown;
    }
    | { type: 'RUN_ERROR'; message?: string; code?: string }
    | { type: 'TEXT_MESSAGE_START'; messageId?: string; role?: string }
    | { type: 'TEXT_MESSAGE_CONTENT'; messageId?: string; delta?: string }
    | { type: 'TEXT_MESSAGE_END'; messageId?: string }
    | { type: 'TEXT_MESSAGE_CHUNK'; messageId?: string; role?: string; delta?: string }
    | { type: 'REASONING_MESSAGE_CONTENT'; messageId?: string; delta?: string }
    | { type: 'REASONING_MESSAGE_CHUNK'; messageId?: string; delta?: string }
    | { type: 'TOOL_CALL_START'; toolCallId: string; toolCallName: string; parentMessageId?: string }
    | { type: 'TOOL_CALL_ARGS'; toolCallId: string; delta?: string }
    | { type: 'TOOL_CALL_END'; toolCallId: string }
    | { type: 'TOOL_CALL_CHUNK'; toolCallId?: string; toolCallName?: string; delta?: string }
    | { type: 'TOOL_CALL_RESULT'; toolCallId: string; content?: unknown; metadata?: Record<string, unknown> };

/** A part of a user message's content, as AG-UI 1.0 describes it — the two aparté sends. */
export type AgUiInputContent =
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'data' | 'url'; value: string; mimeType?: string } };

/** One message of `RunAgentInput.messages`. */
export type AgUiMessage =
    | { id: string; role: 'system'; content: string }
    | { id: string; role: 'user'; content: string | AgUiInputContent[] }
    | {
        id: string;
        role: 'assistant';
        content?: string;
        toolCalls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
    }
    | { id: string; role: 'tool'; content: string; toolCallId: string };

/** One entry of `RunAgentInput.resume`: the answer to one interrupt. */
export interface AgUiResumeItem {
    interruptId: string;
    status: 'resolved' | 'cancelled';
    payload?: unknown;
    metadata?: Record<string, unknown>;
}

/** The request body an AG-UI agent endpoint takes. */
export interface AgUiRunAgentInput {
    threadId: string;
    runId: string;
    protocolVersion?: string;
    parentRunId?: string;
    state: unknown;
    messages: AgUiMessage[];
    tools: { name: string; description: string; parameters: unknown }[];
    context: { description: string; value: string }[];
    forwardedProps: Record<string, unknown>;
    resume?: AgUiResumeItem[];
}

/**
 * The events of an AG-UI response, in order. Server-Sent Events by default — each
 * `data:` block is one JSON event, comments and `event:` lines are skipped, and a
 * `[DONE]` sentinel ends nothing on its own. An NDJSON body (one event per line, the
 * other encoding TanStack AI serves) is read the same way. A block that is not JSON
 * is skipped: a proxy's keep-alive must not end the run.
 */
export async function* readAgUiEvents(
    body: ReadableStream<Uint8Array>,
    contentType: string | null,
): AsyncGenerator<{ type: string } & Record<string, unknown>> {
    const ndjson = Boolean(contentType && /ndjson|jsonl/i.test(contentType));
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let data: string[] = [];
    const parse = (text: string): ({ type: string } & Record<string, unknown>) | undefined => {
        const trimmed = text.trim();
        if (!trimmed || trimmed === '[DONE]') return undefined;
        try {
            const value = JSON.parse(trimmed) as unknown;
            return value && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string'
                ? value as { type: string } & Record<string, unknown>
                : undefined;
        } catch {
            return undefined;
        }
    };
    const takeBlock = () => {
        const event = parse(data.join('\n'));
        data = [];
        return event;
    };
    const line = (raw: string) => {
        const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
        if (ndjson) return parse(text);
        if (text === '') return takeBlock();
        if (text.startsWith('data:')) data.push(text.slice(5).replace(/^ /, ''));
        // `event:`, `id:`, `retry:` and `:` comments: AG-UI carries the type in the JSON.
        return undefined;
    };
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let newline: number;
            while ((newline = buffer.indexOf('\n')) !== -1) {
                const event = line(buffer.slice(0, newline));
                buffer = buffer.slice(newline + 1);
                if (event) yield event;
            }
        }
        buffer += decoder.decode();
        if (buffer) {
            const event = line(buffer);
            if (event) yield event;
        }
        if (!ndjson) {
            const event = takeBlock();
            if (event) yield event;
        }
    } finally {
        reader.releaseLock();
    }
}
