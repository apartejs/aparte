/**
 * One NDJSON reader for every server wire.
 *
 * The chat transport and the agent runner both read `{ type }` objects, one per line,
 * from a server. Splitting lines is where such readers drift: a line cut across two
 * chunks, a last line without its newline, a blank or garbled line.
 */
import { describe, it, expect } from 'vitest';
import { readNdjson } from '../ndjson.js';

const streamOf = (...chunks: string[]) => new ReadableStream<Uint8Array>({
    start(c) { for (const s of chunks) c.enqueue(new TextEncoder().encode(s)); c.close(); },
});

async function collect<T extends { type: string }>(stream: ReadableStream<Uint8Array>): Promise<T[]> {
    const out: T[] = [];
    for await (const e of readNdjson<T>(stream)) out.push(e);
    return out;
}

describe('readNdjson', () => {
    it('reads lines split across chunks, and a last line without a newline', async () => {
        expect(await collect(streamOf('{"type":"a","n":1}\n{"ty', 'pe":"b"}\n{"type":"c"}'))).toEqual([
            { type: 'a', n: 1 }, { type: 'b' }, { type: 'c' },
        ]);
    });

    it('skips blank, malformed and type-less lines', async () => {
        expect(await collect(streamOf('\n{oops}\n{"x":1}\n{"type":"ok"}\n'))).toEqual([{ type: 'ok' }]);
    });

    it('decodes a multi-byte character cut across two chunks', async () => {
        const bytes = new TextEncoder().encode('{"type":"t","s":"été"}\n');
        const cut = bytes.indexOf(0xa9); // inside the first "é"
        const stream = new ReadableStream<Uint8Array>({
            start(c) { c.enqueue(bytes.slice(0, cut)); c.enqueue(bytes.slice(cut)); c.close(); },
        });
        expect(await collect(stream)).toEqual([{ type: 't', s: 'été' }]);
    });

    it('stops reading once the signal is aborted', async () => {
        const controller = new AbortController();
        const out: { type: string }[] = [];
        for await (const e of readNdjson<{ type: string }>(streamOf('{"type":"a"}\n', '{"type":"b"}\n'), controller.signal)) {
            out.push(e);
            controller.abort();
        }
        expect(out).toEqual([{ type: 'a' }]);
    });
});
