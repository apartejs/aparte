import { describe, it, expect } from 'vitest';
import { AparteStreamParser } from '../aparte-stream-parser.js';

/**
 * A fence whose opening line arrives across two deltas must not cost the text
 * that preceded it.
 *
 * When a pattern sits at index 0 the active text segment is detached into a
 * local, to be emitted alongside the new block. If starting the block then
 * fails because the ``` line is not complete yet, the detached segment has to
 * go back — otherwise it is dropped on the floor and the caller, seeing no
 * segments at all, appends the raw delta to the bubble instead. That is how a
 * literal ```python ends up in the rendered message.
 *
 * The artifact branch has always restored it; the code and thinking branches
 * did not. Tokenizers routinely split ``` from its language tag, so this is the
 * common case, not an edge one.
 */
const collect = (deltas: string[]) => {
    const parser = new AparteStreamParser();
    const segments = deltas.flatMap(d => parser.parse(d).segments);
    return [...segments, ...parser.finalize()];
};

describe('AparteStreamParser — an opening fence split across deltas', () => {
    it('keeps the text that preceded a code fence', () => {
        // ``` and the language tag are separate tokens in most vocabularies.
        const segments = collect(['Here is the code:', '\n', '```', 'python', '\n', 'print(1)', '\n', '```', '\nDone.']);

        const text = segments.filter(s => s.type === 'text').map(s => s.content).join('');
        expect(text, 'the lead-in text was dropped when the fence split').toContain('Here is the code:');
        expect(text, 'the raw fence leaked into the text').not.toContain('```');
        expect(text).not.toContain('python');

        const code = segments.find(s => s.type === 'code');
        expect(code).toBeDefined();
        expect(code?.content).toContain('print(1)');
    });

    it('keeps the text that preceded a thinking block', () => {
        const segments = collect(['Let me think.', '\n', '<thinking', '>', 'hmm', '</thinking>', '\nDone.']);

        const text = segments.filter(s => s.type === 'text').map(s => s.content).join('');
        expect(text).toContain('Let me think.');
        expect(text).not.toContain('<thinking');
    });

    it('still works when the fence arrives whole (the case that already passed)', () => {
        const segments = collect(['Here is the code:\n', '```python\n', 'print(1)\n', '```\n', 'Done.']);
        const text = segments.filter(s => s.type === 'text').map(s => s.content).join('');
        expect(text).toContain('Here is the code:');
        expect(text).not.toContain('```');
    });
});
