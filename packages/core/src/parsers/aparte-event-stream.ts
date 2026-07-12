/**
 * Aparte event stream parser — the wire format for the backend path.
 *
 * A backend that keeps the API key server-side runs the vendor's own parser
 * server-side and streams back **already-normalized `AparteStreamEvent`s, one JSON
 * object per line (NDJSON)**. This parser turns that NDJSON byte stream back
 * into a `ReadableStream<AparteStreamEvent>`, so the client stays fully
 * vendor-agnostic on the backend path (it never needs the vendor-specific
 * `parseStream`). See `transport/backend-transport.ts`.
 */

import type { AparteStreamEvent } from '../types/index.js';

export function parseAparteEventStream(
    stream: ReadableStream<Uint8Array>,
): ReadableStream<AparteStreamEvent> {
    const decoder = new TextDecoder();
    let buffer = '';
    let sawDone = false;

    return new ReadableStream<AparteStreamEvent>({
        async start(controller) {
            const reader = stream.getReader();
            const emit = (line: string): void => {
                const trimmed = line.trim();
                if (!trimmed) return;
                try {
                    const event = JSON.parse(trimmed) as AparteStreamEvent;
                    if (event && typeof (event as { type?: unknown }).type === 'string') {
                        controller.enqueue(event);
                        if (event.type === 'done') sawDone = true;
                    }
                } catch { /* skip a malformed / partial line */ }
            };
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';
                    for (const line of lines) emit(line);
                }
                if (buffer.trim()) emit(buffer);
                if (!sawDone) controller.enqueue({ type: 'done' });
            } catch (err) {
                controller.enqueue({ type: 'error', message: (err as Error)?.message ?? 'Stream error' });
            } finally {
                reader.releaseLock();
                controller.close();
            }
        },
    });
}
