/**
 * `finalize()` ends the reply AND the mode it ended in.
 *
 * The parser is a public export and reusable: a consumer driving it themselves —
 * the bring-your-own-loop path — keeps one and calls `finalize()` between replies.
 * (The built-in client does not: `createStreamAdapter` builds a fresh parser on
 * every `turn-start`.) A reply cut off inside a fence, a reasoning block or a
 * registered block used to leave `mode` on 'code' / 'thinking' / 'block' with the
 * closing delimiter still armed, so the FIRST chunks of the next reply were eaten
 * by a close that never came: the opening of the next answer simply vanished.
 *
 * Each case asserts the SECOND reply's segments, not the parser's state — the
 * state is the mechanism, the swallowed prose is the bug.
 */
import { describe, it, expect } from 'vitest';
import { AparteStreamParser } from '../aparte-stream-parser.js';
import type { AparteSegment } from '../../types/index.js';
import type { AparteStreamBlock } from '../../types/stream-blocks.js';

const note: AparteStreamBlock = {
    tag: 'note',
    toSegment: ({ attrs, id }) => ({ id, type: 'note', kind: attrs['kind'] ?? 'plain', content: '' } as unknown as AparteSegment & { content: string }),
};

const SECOND = 'The second reply arrives whole.';

/** Feed one reply, finalize it, then feed the next one and finalize that. */
function secondReply(first: string[], blocks: AparteStreamBlock[] = []): AparteSegment[] {
    const parser = new AparteStreamParser({ blocks });
    for (const c of first) parser.parse(c);
    parser.finalize();

    const out: AparteSegment[] = [...parser.parse(SECOND).segments];
    out.push(...parser.finalize());
    return out;
}

const textOf = (segs: AparteSegment[]): string =>
    segs.filter((s) => s.type === 'text').map((s) => (s as { content: string }).content).join('');

describe('finalize() spends the mode it closed', () => {
    it('after a reply cut off inside a code fence', () => {
        const out = secondReply(['```js\nconst answer = 42;']);
        expect(out.map((s) => s.type)).toEqual(['text']);
        expect(textOf(out)).toBe(SECOND);
    });

    it('after a reply cut off inside a reasoning block', () => {
        const out = secondReply(['<think>still weighing the options']);
        expect(out.map((s) => s.type)).toEqual(['text']);
        expect(textOf(out)).toBe(SECOND);
    });

    it('after a reply cut off inside a registered block', () => {
        const out = secondReply(['<note kind="k">half a note'], [note]);
        expect(out.map((s) => s.type)).toEqual(['text']);
        expect(textOf(out)).toBe(SECOND);
    });

    it('and the next reply can open a block of its own', () => {
        const parser = new AparteStreamParser({ blocks: [note] });
        parser.parse('```js\nconst answer = 42;');
        parser.finalize();

        const out = [...parser.parse('Look: <note kind="k">a fresh one</note>').segments];
        out.push(...parser.finalize());
        expect(out.map((s) => s.type)).toEqual(['text', 'note']);
        expect(textOf(out)).toBe('Look: ');
    });

    it('leaves the state as new — the mechanism behind the three cases above', () => {
        const parser = new AparteStreamParser({ blocks: [note] });
        parser.parse('<note kind="k">half a note');
        expect(parser.getState().mode, 'the reply really ended mid-block').toBe('block');
        parser.finalize();

        const state = parser.getState();
        expect(state.mode).toBe('text');
        expect(state.buffer).toBe('');
        expect(state.activeSegment).toBeNull();
        expect(state.blockEnd).toBeUndefined();
        expect(state.thinkingEnd).toBeUndefined();
        expect(state.codeLanguage).toBeUndefined();
    });
});
