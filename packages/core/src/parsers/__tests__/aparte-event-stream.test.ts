import { describe, it, expect } from 'vitest';
import { parseAparteEventStream } from '../aparte-event-stream.js';
import type { AparteStreamEvent } from '../../types/index.js';

/** A byte stream that emits each string as one chunk, then closes. */
function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
    const enc = new TextEncoder();
    let i = 0;
    return new ReadableStream<Uint8Array>({
        pull(c) {
            if (i < chunks.length) c.enqueue(enc.encode(chunks[i++]));
            else c.close();
        },
    });
}

/** Like streamFromChunks but errors the stream after the last chunk. */
function erroringStream(chunks: string[], message = 'boom'): ReadableStream<Uint8Array> {
    const enc = new TextEncoder();
    let i = 0;
    return new ReadableStream<Uint8Array>({
        pull(c) {
            if (i < chunks.length) c.enqueue(enc.encode(chunks[i++]));
            else c.error(new Error(message));
        },
    });
}

async function collect(stream: ReadableStream<AparteStreamEvent>): Promise<AparteStreamEvent[]> {
    const out: AparteStreamEvent[] = [];
    const reader = stream.getReader();
    for (;;) { const { done, value } = await reader.read(); if (done) break; out.push(value); }
    return out;
}

describe('parseAparteEventStream (NDJSON backend wire format)', () => {
    it('parses one JSON event per line', async () => {
        const out = await collect(parseAparteEventStream(streamFromChunks([
            '{"type":"text","delta":"a"}\n{"type":"text","delta":"b"}\n{"type":"done"}\n',
        ])));
        expect(out).toEqual([
            { type: 'text', delta: 'a' },
            { type: 'text', delta: 'b' },
            { type: 'done' },
        ]);
    });

    it('buffers a JSON object split across chunks (mid-line truncation)', async () => {
        const out = await collect(parseAparteEventStream(streamFromChunks([
            '{"type":"text","del',   // cut in the middle of a key
            'ta":"hi"}\n{"type":"done"}\n',
        ])));
        expect(out).toEqual([{ type: 'text', delta: 'hi' }, { type: 'done' }]);
    });

    it('reassembles a large payload spread over many small chunks', async () => {
        const big = 'x'.repeat(5000);
        const line = JSON.stringify({ type: 'text', delta: big }) + '\n' + JSON.stringify({ type: 'done' }) + '\n';
        // Feed it 7 bytes at a time to force heavy re-buffering.
        const chunks: string[] = [];
        for (let i = 0; i < line.length; i += 7) chunks.push(line.slice(i, i + 7));
        const out = await collect(parseAparteEventStream(streamFromChunks(chunks)));
        expect(out).toEqual([{ type: 'text', delta: big }, { type: 'done' }]);
    });

    it('skips blank and whitespace-only lines', async () => {
        const out = await collect(parseAparteEventStream(streamFromChunks([
            '\n   \n{"type":"text","delta":"a"}\n\n{"type":"done"}\n',
        ])));
        expect(out).toEqual([{ type: 'text', delta: 'a' }, { type: 'done' }]);
    });

    it('skips a malformed JSON line but keeps the valid ones around it', async () => {
        const out = await collect(parseAparteEventStream(streamFromChunks([
            '{"type":"text","delta":"a"}\nnot-json-at-all\n{"type":"done"}\n',
        ])));
        expect(out).toEqual([{ type: 'text', delta: 'a' }, { type: 'done' }]);
    });

    it('drops JSON that lacks a string `type`', async () => {
        const out = await collect(parseAparteEventStream(streamFromChunks([
            '{"foo":1}\n{"type":123}\n{"type":"done"}\n',
        ])));
        expect(out).toEqual([{ type: 'done' }]);
    });

    it('flushes a final line that has no trailing newline', async () => {
        const out = await collect(parseAparteEventStream(streamFromChunks(['{"type":"done"}'])));
        expect(out).toEqual([{ type: 'done' }]);
    });

    it('appends a synthetic done when the stream ends without one', async () => {
        const out = await collect(parseAparteEventStream(streamFromChunks(['{"type":"text","delta":"x"}\n'])));
        expect(out).toEqual([{ type: 'text', delta: 'x' }, { type: 'done' }]);
    });

    it('does not emit a second done when the stream already sent one', async () => {
        const out = await collect(parseAparteEventStream(streamFromChunks(['{"type":"done"}\n'])));
        expect(out.filter((e) => e.type === 'done')).toHaveLength(1);
    });

    it('emits an error event when the underlying stream errors mid-flight', async () => {
        const out = await collect(parseAparteEventStream(erroringStream(['{"type":"text","delta":"x"}\n'], 'network died')));
        expect(out[0]).toEqual({ type: 'text', delta: 'x' });
        expect(out.at(-1)).toEqual({ type: 'error', message: 'network died' });
    });
});
