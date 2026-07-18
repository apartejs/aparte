import { describe, it, expect } from 'vitest';
import { parseMarkdownToSegments, AparteStreamParser } from '../index';
import type { AparteSegment } from '../../types/index.js';

describe('Markdown to Segments Parser', () => {
    describe('Basic Parsing', () => {
        it('should parse simple text', () => {
            const result = parseMarkdownToSegments('Hello World');

            expect(result).toBeDefined();
            expect(result.length).toBeGreaterThan(0);
        });

        it('assembles plain text streamed across chunk boundaries', () => {
            const parser = new AparteStreamParser();
            const out: AparteSegment[] = [];
            for (const chunk of ['Chunk ', '1 ', 'Test']) {
                out.push(...parser.parse(chunk).segments);
            }
            out.push(...parser.finalize());
            const joined = out
                .filter(seg => seg.type === 'text')
                .map(seg => (seg as { content: string }).content)
                .join('');
            expect(joined).toContain('Chunk 1 Test');
        });

        it('should parse code blocks', () => {
            const markdown = '```typescript\nconst x = 42;\n```';
            const result = parseMarkdownToSegments(markdown);

            expect(result).toBeDefined();
            const codeSegment = result.find(s => s.type === 'code');
            expect(codeSegment).toBeDefined();
        });
    });

    describe('Large input', () => {
        it('preserves the full content of large text (no truncation)', () => {
            const largeText = 'Lorem ipsum '.repeat(1000);
            const result = parseMarkdownToSegments(largeText);
            const joined = result
                .filter(seg => seg.type === 'text')
                .map(seg => (seg as { content: string }).content)
                .join('');
            expect(joined).toContain('Lorem ipsum');
            expect(joined.length).toBeGreaterThanOrEqual(largeText.trim().length - 10);
        });
    });

    describe('Streaming code-fence boundaries', () => {
        const codeOf = (segs: AparteSegment[]) =>
            segs.find(seg => seg.type === 'code') as { content: string } | undefined;
        const textOf = (segs: AparteSegment[]) =>
            segs.filter(seg => seg.type === 'text').map(seg => (seg as { content: string }).content).join('');

        it('parses a code block whose opening AND closing fences are split across chunks', () => {
            const parser = new AparteStreamParser();
            const out: AparteSegment[] = [];
            for (const chunk of ['```ty', 'pescript\ncon', 'st x = 4', '2;\n', '``', '`\ndone']) {
                out.push(...parser.parse(chunk).segments);
            }
            out.push(...parser.finalize());
            expect(codeOf(out)?.content).toContain('const x = 42;');
            expect(textOf(out)).toContain('done');
        });

        it('finalize() flushes an unterminated code fence — content is not lost', () => {
            const parser = new AparteStreamParser();
            const out: AparteSegment[] = [];
            out.push(...parser.parse('```js\nconst y = 1;').segments);
            out.push(...parser.finalize()); // no closing fence
            const all = out.map(seg => (seg as { content?: string }).content ?? '').join('');
            expect(all).toContain('const y = 1;');
        });
    });

    describe('Thinking delimiters', () => {
        const thinking = (segs: AparteSegment[]) =>
            segs.filter(s => s.type === 'thinking').map(s => (s as { content: string }).content);
        const text = (segs: AparteSegment[]) =>
            segs.filter(s => s.type === 'text').map(s => (s as { content: string }).content).join('');

        it('recognizes <think> out of the box (DeepSeek-R1/QwQ), not just <thinking>', () => {
            const segs = parseMarkdownToSegments('<think>reasoning</think>Hello');
            expect(thinking(segs)).toEqual(['reasoning']);
            expect(text(segs)).toContain('Hello');
        });

        it('still recognizes the Claude-style <thinking> convention', () => {
            const segs = parseMarkdownToSegments('<thinking>reasoning</thinking>Hi');
            expect(thinking(segs)).toEqual(['reasoning']);
            expect(text(segs)).toContain('Hi');
        });

        it('closes each block with the delimiter that opened it, across mixed blocks', () => {
            const segs = parseMarkdownToSegments('<think>alpha</think>middle<thinking>beta</thinking>end');
            expect(thinking(segs)).toEqual(['alpha', 'beta']);
            expect(text(segs)).toContain('middle');
            expect(text(segs)).toContain('end');
        });

        it('detects <think> split across streaming chunk boundaries', () => {
            const parser = new AparteStreamParser();
            const out: AparteSegment[] = [];
            for (const chunk of ['<thi', 'nk>rea', 'soning</thi', 'nk>done']) {
                out.push(...parser.parse(chunk).segments);
            }
            out.push(...parser.finalize());
            expect(thinking(out)).toEqual(['reasoning']);
            expect(text(out)).toContain('done');
        });

        it('honors a custom override and stops recognizing the defaults', () => {
            const opts = { thinkingDelimiters: { start: '[[', end: ']]' } };
            expect(thinking(parseMarkdownToSegments('[[secret]]shown', opts))).toEqual(['secret']);
            // Under an explicit override, <think> is plain text, not a thinking block.
            const segs = parseMarkdownToSegments('<think>x</think>y', opts);
            expect(thinking(segs)).toEqual([]);
            expect(text(segs)).toContain('<think>x</think>y');
        });
    });
});
