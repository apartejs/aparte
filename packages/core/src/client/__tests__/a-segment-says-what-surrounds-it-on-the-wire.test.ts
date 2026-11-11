/**
 * A segment of a type core does not know can say what surrounds its `content` when the
 * model reads it back.
 *
 * A block grammar turns `<note id="n1">…</note>` into a segment, and the history used to
 * send back the body alone: the model wrote a tag and read plain text, so it could not see
 * what it had named, nor name it again to change it. `wire` is the segment's own answer —
 * two strings core puts around the content, and nothing core has to know about the tag.
 */
import { describe, it, expect } from 'vitest';
import { segmentsToWireText, wireMessages } from '../wire-history.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';

const note = (extra: Record<string, unknown>): AparteSegment => ({ id: 's1', type: 'note', content: 'remember the milk', ...extra }) as never;

describe("a segment's `wire`", () => {
    it('surrounds the content of a type core does not know', () => {
        const text = segmentsToWireText([note({ wire: { before: '<note id="n1">\n', after: '\n</note>' } })]);
        expect(text).toBe('<note id="n1">\nremember the milk\n</note>');
    });

    it('takes one side alone', () => {
        expect(segmentsToWireText([note({ wire: { before: '[note] ' } })])).toBe('[note] remember the milk');
        expect(segmentsToWireText([note({ wire: { after: ' [end]' } })])).toBe('remember the milk [end]');
    });

    it('changes nothing for a segment that has none: the content alone, as before', () => {
        expect(segmentsToWireText([note({})])).toBe('remember the milk');
    });

    it('surrounds nothing: a segment with no content still reads as its fallback, bare', () => {
        const empty = { id: 's1', type: 'note', content: '', fallback: '[a note]', wire: { before: '<note>', after: '</note>' } } as never;
        expect(segmentsToWireText([empty])).toBe('[a note]');
    });

    it("is not read on the types core serialises itself: a text stays its content, a code block its fence", () => {
        const wire = { before: '<x>', after: '</x>' };
        expect(segmentsToWireText([{ id: 't', type: 'text', content: 'hello', wire } as never])).toBe('hello');
        expect(segmentsToWireText([{ id: 'c', type: 'code', language: 'js', content: 'a()', wire } as never])).toBe('```js\na()\n```');
    });

    it('ignores a `wire` that is not two strings', () => {
        expect(segmentsToWireText([note({ wire: { before: 7, after: null } })])).toBe('remember the milk');
        expect(segmentsToWireText([note({ wire: 'nope' })])).toBe('remember the milk');
    });

    it('reaches the history a request carries', () => {
        const messages: AparteMessage[] = [
            { id: 'u1', role: 'user', content: 'note it', timestamp: 0 } as AparteMessage,
            { id: 'a1', role: 'assistant', content: '', timestamp: 0, segments: [
                { id: 't', type: 'text', content: 'Done.' } as never,
                note({ wire: { before: '<note id="n1">', after: '</note>' } }),
            ] } as AparteMessage,
        ];
        expect(wireMessages(messages).at(-1)?.content).toBe('Done.\n<note id="n1">remember the milk</note>');
    });
});
