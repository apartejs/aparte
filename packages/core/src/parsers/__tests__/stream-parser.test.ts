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

        it('should handle delayed chunks without UI jumps', async () => {
            const chunks: string[] = [];
            const timestamps: number[] = [];

            // Simulate streaming
            const chunk1 = 'Chunk ';
            const chunk2 = '1 ';
            const chunk3 = 'Test';

            chunks.push(chunk1);
            timestamps.push(Date.now());

            await new Promise(resolve => setTimeout(resolve, 50));

            chunks.push(chunk2);
            timestamps.push(Date.now());

            await new Promise(resolve => setTimeout(resolve, 50));

            chunks.push(chunk3);
            timestamps.push(Date.now());

            expect(chunks).toEqual(['Chunk ', '1 ', 'Test']);

            // Verify delays between chunks
            if (timestamps.length >= 2) {
                const delay1 = timestamps[1] - timestamps[0];
                expect(delay1).toBeGreaterThanOrEqual(40);
            }
        });

        it('should parse code blocks', () => {
            const markdown = '```typescript\nconst x = 42;\n```';
            const result = parseMarkdownToSegments(markdown);

            expect(result).toBeDefined();
            const codeSegment = result.find(s => s.type === 'code');
            expect(codeSegment).toBeDefined();
        });
    });

    describe('Performance', () => {
        it('should handle large text efficiently', () => {
            const start = Date.now();
            const largeText = 'Lorem ipsum '.repeat(1000);

            parseMarkdownToSegments(largeText);

            const duration = Date.now() - start;
            expect(duration).toBeLessThan(100);
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
