/**
 * Newline-delimited JSON, one `{ type }` object per line — the wire of both server
 * handlers (`createAparteChatHandler`, `createAparteAgentHandler`).
 *
 * One reader, so the chat transport and the agent runner split lines the same way: a
 * line cut across two chunks, a character cut across two chunks, a last line without its
 * newline. A blank line, a line that is not JSON, and an object without a string `type`
 * are skipped — a proxy's keep-alive or a truncated write must not end the stream.
 */
export async function* readNdjson<T extends { type: string }>(
    stream: ReadableStream<Uint8Array>,
    signal?: AbortSignal,
): AsyncGenerator<T> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const parse = (line: string): T | undefined => {
        const trimmed = line.trim();
        if (!trimmed) return undefined;
        try {
            const value = JSON.parse(trimmed) as T;
            return value && typeof value.type === 'string' ? value : undefined;
        } catch {
            return undefined;
        }
    };
    try {
        while (!signal?.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                if (signal?.aborted) return;
                const event = parse(line);
                if (event) yield event;
            }
        }
        if (signal?.aborted) return;
        const last = parse(buffer + decoder.decode());
        if (last) yield last;
    } finally {
        reader.releaseLock();
    }
}
