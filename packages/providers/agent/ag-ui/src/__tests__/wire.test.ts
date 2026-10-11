/**
 * readAgUiEvents — the SSE and NDJSON reader, on the wires a network actually delivers:
 * one byte at a time (a character split across two reads), CRLF line endings, an event
 * spread over several `data:` lines, and the lines SSE allows that carry no event.
 */
import { describe, it, expect } from 'vitest';
import { readAgUiEvents } from '../wire.js';

/** A body delivered in pieces of `size` bytes. */
function body(text: string, size = Infinity): ReadableStream<Uint8Array> {
    const all = new TextEncoder().encode(text);
    let at = 0;
    return new ReadableStream({
        pull(controller) {
            if (at >= all.length) { controller.close(); return; }
            const n = Math.min(size, all.length - at);
            controller.enqueue(all.slice(at, at + n));
            at += n;
        },
    });
}

async function read(stream: ReadableStream<Uint8Array>, contentType = 'text/event-stream') {
    const events: Record<string, unknown>[] = [];
    for await (const event of readAgUiEvents(stream, contentType)) events.push(event);
    return events;
}

const WIRE = [
    'data: {"type":"RUN_STARTED","threadId":"t","runId":"r"}', '',
    'data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"m","delta":"14 °C, été"}', '',
    'data: {"type":"RUN_FINISHED","threadId":"t","runId":"r"}', '', '',
].join('\n');

describe('readAgUiEvents', () => {
    it('reads a stream delivered one byte at a time, a character split across two reads included', async () => {
        const events = await read(body(WIRE, 1));
        expect(events.map((e) => e['type'])).toEqual(['RUN_STARTED', 'TEXT_MESSAGE_CONTENT', 'RUN_FINISHED']);
        expect(events[1]!['delta']).toBe('14 °C, été');
    });

    it('reads CRLF line endings, whole or cut between the CR and the LF', async () => {
        const crlf = WIRE.replace(/\n/g, '\r\n');
        for (const size of [Infinity, 1, 2]) {
            const events = await read(body(crlf, size));
            expect(events.map((e) => e['type'])).toEqual(['RUN_STARTED', 'TEXT_MESSAGE_CONTENT', 'RUN_FINISHED']);
            expect(events[1]!['delta']).toBe('14 °C, été');
        }
    });

    it('joins one event spread over several data: lines', async () => {
        const events = await read(body('data: {"type":"TEXT_MESSAGE_CONTENT",\ndata:"delta":"a\\nb"}\n\n'));
        expect(events).toEqual([{ type: 'TEXT_MESSAGE_CONTENT', delta: 'a\nb' }]);
    });

    it('skips comments, event/id/retry lines, a keep-alive, [DONE] and a block that is not an event', async () => {
        const events = await read(body([
            ': keep-alive', '',
            'event: message', 'id: 7', 'retry: 1000', 'data: {"type":"RUN_STARTED"}', '',
            'data: not json', '',
            'data: {"no":"type"}', '',
            'data: [DONE]', '',
        ].join('\n')));
        expect(events).toEqual([{ type: 'RUN_STARTED' }]);
    });

    it('takes a last event that no blank line closes', async () => {
        const events = await read(body('data: {"type":"RUN_STARTED"}\n\ndata: {"type":"RUN_FINISHED"}'));
        expect(events.map((e) => e['type'])).toEqual(['RUN_STARTED', 'RUN_FINISHED']);
    });

    it('reads NDJSON one byte at a time, skipping a line that is not an event', async () => {
        const ndjson = '{"type":"RUN_STARTED"}\r\nnot json\n\n{"type":"TEXT_MESSAGE_CONTENT","delta":"é"}\n{"type":"RUN_FINISHED"}';
        const events = await read(body(ndjson, 1), 'application/x-ndjson');
        expect(events.map((e) => e['type'])).toEqual(['RUN_STARTED', 'TEXT_MESSAGE_CONTENT', 'RUN_FINISHED']);
        expect(events[1]!['delta']).toBe('é');
    });
});
