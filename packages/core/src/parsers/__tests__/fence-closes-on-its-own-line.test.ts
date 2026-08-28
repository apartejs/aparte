/**
 * A fence closes on its own line — and only there.
 *
 * `_parseCodeMode` looked for `\n```` (CommonMark: a closing fence starts a line)
 * and then, when it found none, ALSO closed the block on any buffer that happened
 * to end in three backticks. A tokenizer that splits  const s = "```";  right after
 * the quotes handed the parser a buffer ending in ``` — the block closed mid-code
 * and the rest of the file streamed as prose. The shortcut is gone; the one case it
 * served (a reply that ends on ``` with no newline before it) is handled at
 * `finalize()`, where stripping the fence cannot mis-close anything.
 */
import { describe, it, expect } from 'vitest';
import { AparteStreamParser } from '../aparte-stream-parser.js';

const collect = (deltas: string[]) => {
    const parser = new AparteStreamParser();
    const segments = deltas.flatMap(d => parser.parse(d).segments);
    return [...segments, ...parser.finalize()];
};

describe('AparteStreamParser — a closing fence needs its own line', () => {
    it('does not close a block on a chunk that merely ends in three backticks', () => {
        const segments = collect(['```ts\n', 'const s = "```', '";\nmore();\n', '```\n']);
        const code = segments.filter(s => s.type === 'code');
        expect(code).toHaveLength(1);
        expect((code[0] as { content: string }).content).toBe('const s = "```";\nmore();');
        // Nothing of the block leaked into a text segment.
        const text = segments.filter(s => s.type === 'text').map(s => (s as { content: string }).content).join('');
        expect(text).not.toContain('more()');
    });

    it('still strips a fence the reply ends on without a newline, at finalize', () => {
        const segments = collect(['```ts\n', 'const a = 1;```']);
        expect(segments).toHaveLength(1);
        expect(segments[0]!.type).toBe('code');
        expect((segments[0] as { content: string }).content).toBe('const a = 1;');
    });

    it('closes on a fence that starts a line, as before', () => {
        const segments = collect(['```ts\n', 'x\n', '```', '\nafter']);
        expect(segments.map(s => s.type)).toEqual(['code', 'text']);
        expect((segments[0] as { content: string }).content).toBe('x');
        expect((segments[1] as { content: string }).content.trim()).toBe('after');
    });
});
