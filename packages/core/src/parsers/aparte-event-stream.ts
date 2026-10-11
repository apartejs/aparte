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
import { readNdjson } from '../utils/ndjson.js';

export function parseAparteEventStream(
    stream: ReadableStream<Uint8Array>,
): ReadableStream<AparteStreamEvent> {
    return new ReadableStream<AparteStreamEvent>({
        async start(controller) {
            let sawDone = false;
            try {
                for await (const event of readNdjson<AparteStreamEvent>(stream)) {
                    controller.enqueue(event);
                    if (event.type === 'done') sawDone = true;
                }
                // A server that closed without its `done` line still ended the reply.
                if (!sawDone) controller.enqueue({ type: 'done' });
            } catch (err) {
                controller.enqueue({ type: 'error', message: (err as Error)?.message ?? 'Stream error' });
            } finally {
                controller.close();
            }
        },
    });
}
