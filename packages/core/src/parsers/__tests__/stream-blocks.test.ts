/**
 * Registered stream blocks — `<tag attr="…">…</tag>` in the prose, turned into the
 * segment a consumer's grammar builds.
 *
 * The parser does the streaming work once for every grammar: the race against a
 * code fence and a reasoning delimiter, a tag cut at a chunk boundary, attributes
 * quoted or bare, the closing tag split across two chunks, a block still open when
 * the stream ends. Each of those is one test here, on a grammar that exists nowhere
 * else, so nothing built in can be doing the work by accident.
 */
import { describe, it, expect } from 'vitest';
import { AparteStreamParser } from '../aparte-stream-parser.js';
import { AparteConfig } from '../../config/aparte-config.js';
import type { AparteSegment } from '../../types/index.js';
import type { AparteStreamBlock } from '../../types/stream-blocks.js';

interface NoteSegment { id: string; type: 'note'; kind: string; title?: string; content: string; isStreaming?: boolean }

const note: AparteStreamBlock = {
    tag: 'note',
    toSegment: ({ attrs, id }) => ({ id, type: 'note', kind: attrs['kind'] ?? 'plain', title: attrs['title'], content: '' } as unknown as AparteSegment & { content: string }),
};

/** Feed the chunks one by one and collect everything the parser emits, finals included. */
function run(chunks: string[], blocks: AparteStreamBlock[] = [note]): AparteSegment[] {
    const parser = new AparteStreamParser({ blocks });
    const out: AparteSegment[] = [];
    for (const c of chunks) out.push(...parser.parse(c).segments);
    out.push(...parser.finalize());
    return out;
}

// `as string`: a registered grammar builds a type the closed union does not know — which
// is the point of the seam, and exactly what the compiler flags as "no overlap".
const notes = (segs: AparteSegment[]): NoteSegment[] => segs.filter((s) => (s.type as string) === 'note') as unknown as NoteSegment[];
const texts = (segs: AparteSegment[]): string[] => segs.filter((s) => s.type === 'text').map((s) => (s as { content: string }).content);

describe('registered stream blocks', () => {
    it('turns a whole block into the grammar\'s segment, with the text around it', () => {
        const out = run(['Before <note kind="tip" title=\'Read me\'>the body</note> after']);
        expect(out.map((s) => s.type)).toEqual(['text', 'note', 'text']);
        const [n] = notes(out);
        expect(n!.kind).toBe('tip');
        expect(n!.title).toBe('Read me');
        expect(n!.content).toBe('the body');
        expect(n!.isStreaming, 'closed at </note>').toBe(false);
        expect(texts(out)).toEqual(['Before ', ' after']);
    });

    it('reads bare attribute values and ignores what is not an attribute', () => {
        const [n] = notes(run(['<note kind=warn data-x>x</note>']));
        expect(n!.kind).toBe('warn');
    });

    it('does not open on a tag whose name merely starts with the registered one', () => {
        const out = run(['<notes>not a block</notes>']);
        expect(notes(out)).toHaveLength(0);
        expect(texts(out).join('')).toBe('<notes>not a block</notes>');
    });

    it('holds back an opening tag cut at a chunk boundary, in every place it can be cut', () => {
        for (const chunks of [
            ['<no', 'te kind="a">body</note>'],
            ['<note', ' kind="a">body</note>'],
            ['<note kind="', 'a">body</note>'],
            ['<note kind="a"', '>body</note>'],
        ]) {
            const out = run(chunks);
            const [n] = notes(out);
            expect(n, chunks.join('|')).toBeDefined();
            expect(n!.kind, chunks.join('|')).toBe('a');
            expect(n!.content, chunks.join('|')).toBe('body');
            expect(texts(out).join(''), 'no tag fragment leaked as text').toBe('');
        }
    });

    it('never emits a closing tag split across chunks as content', () => {
        for (const chunks of [
            ['<note>abc</no', 'te>'],
            ['<note>abc<', '/note>'],
            ['<note>abc</note', '>'],
            ['<note>a', 'b', 'c', '</', 'note', '>'],
        ]) {
            const [n] = notes(run(chunks));
            expect(n!.content, chunks.join('|')).toBe('abc');
            expect(n!.isStreaming, chunks.join('|')).toBe(false);
        }
    });

    it('streams the body into the open segment delta by delta', () => {
        const parser = new AparteStreamParser({ blocks: [note] });
        parser.parse('<note>hello ');
        const open = parser.getState().activeSegment as unknown as NoteSegment;
        expect(open.type).toBe('note');
        expect(open.isStreaming).toBe(true);
        // The last `</note>`.length characters are held back until they are known
        // not to be the closing tag, so the streamed content trails the input.
        parser.parse('world, and more');
        expect((parser.getState().activeSegment as unknown as NoteSegment).content.startsWith('hello ')).toBe(true);
        const [closed] = parser.parse('</note>').segments;
        expect((closed as unknown as NoteSegment).content).toBe('hello world, and more');
    });

    it('closes a block still open when the stream ends, keeping what arrived', () => {
        const [n] = notes(run(['<note kind="x">cut off mid']));
        expect(n!.content).toBe('cut off mid');
        expect(n!.isStreaming).toBe(false);
    });

    it('lets the earliest pattern win the race against a code fence and a reasoning tag', () => {
        // The closing fence takes its own newline, so the note follows the code directly.
        const out = run(['```js\nx\n```\n<note>n</note>\n<think>t</think>']);
        expect(out.map((s) => s.type)).toEqual(['code', 'note', 'text', 'thinking']);
        const out2 = run(['<note>```not a fence```</note>']);
        expect(out2.map((s) => s.type)).toEqual(['note']);
        expect(notes(out2)[0]!.content).toBe('```not a fence```');
    });

    it('a self-closing tag is a block with no body, in its place among the text', () => {
        const out = run(['a <note kind="k"/> b']);
        expect(out.map((s) => s.type)).toEqual(['text', 'note', 'text']);
        expect(notes(out)[0]!.kind).toBe('k');
        expect(notes(out)[0]!.content).toBe('');
        expect(texts(out)).toEqual(['a ', ' b']);
    });

    it('several grammars coexist, and a tag not registered stays text', () => {
        const cite: AparteStreamBlock = {
            tag: 'cite',
            toSegment: ({ id, attrs }) => ({ id, type: 'cite', url: attrs['url'], content: '' } as unknown as AparteSegment & { content: string }),
        };
        const out = run(['<cite url="u">c</cite><note>n</note><other>o</other>'], [note, cite]);
        expect(out.map((s) => s.type)).toEqual(['cite', 'note', 'text']);
    });

    it('with no grammar registered, the tag is plain text — nothing built in recognises it', () => {
        const out = run(['<note kind="x">body</note>'], []);
        expect(out.map((s) => s.type)).toEqual(['text']);
    });
});

describe('AparteConfig.registerStreamBlock', () => {
    it('registers by tag, replaces on the same tag, forgets on unregister and on reset', () => {
        const cfg = new AparteConfig();
        expect(cfg.getStreamBlocks()).toEqual([]);
        cfg.registerStreamBlock(note);
        const again: AparteStreamBlock = { ...note, toSegment: note.toSegment };
        cfg.registerStreamBlock(again);
        expect(cfg.getStreamBlocks()).toEqual([again]);
        cfg.unregisterStreamBlock('note');
        expect(cfg.getStreamBlocks()).toEqual([]);
        cfg.registerStreamBlock(note);
        cfg.reset();
        expect(cfg.getStreamBlocks()).toEqual([]);
    });

    it('notifies subscribers, so a change is observable like every other registration', () => {
        const cfg = new AparteConfig();
        let n = 0;
        const off = cfg.subscribe(() => { n++; });
        cfg.registerStreamBlock(note);
        cfg.unregisterStreamBlock('note');
        cfg.unregisterStreamBlock('note');   // nothing to forget: no notification
        off();
        expect(n).toBe(2);
    });
});
