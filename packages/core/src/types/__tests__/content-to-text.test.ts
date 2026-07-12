import { describe, it, expect } from 'vitest';
import { contentToText } from '../chat.js';
import type { AparteContentPart } from '../chat.js';

describe('contentToText', () => {
    // ─── string passthrough ────────────────────────────────────────────────

    it('returns a plain string unchanged', () => {
        expect(contentToText('hello world')).toBe('hello world');
    });

    it('returns an empty string unchanged', () => {
        expect(contentToText('')).toBe('');
    });

    // ─── AparteContentPart[] ─────────────────────────────────────────────────

    it('extracts text from a single text part', () => {
        const parts: AparteContentPart[] = [{ type: 'text', text: 'hello' }];
        expect(contentToText(parts)).toBe('hello');
    });

    it('concatenates multiple text parts', () => {
        const parts: AparteContentPart[] = [
            { type: 'text', text: 'foo' },
            { type: 'text', text: 'bar' }
        ];
        expect(contentToText(parts)).toBe('foobar');
    });

    it('ignores image parts', () => {
        const parts: AparteContentPart[] = [
            { type: 'text', text: 'caption' },
            { type: 'image', image: 'data:image/png;base64,abc123' }
        ];
        expect(contentToText(parts)).toBe('caption');
    });

    it('ignores file parts', () => {
        const parts: AparteContentPart[] = [
            { type: 'file', data: 'base64data', mimeType: 'application/pdf', name: 'doc.pdf' },
            { type: 'text', text: 'see attachment' }
        ];
        expect(contentToText(parts)).toBe('see attachment');
    });

    it('returns empty string when array contains only image parts', () => {
        const parts: AparteContentPart[] = [
            { type: 'image', image: 'data:image/jpeg;base64,xyz' }
        ];
        expect(contentToText(parts)).toBe('');
    });

    it('returns empty string for an empty array', () => {
        expect(contentToText([])).toBe('');
    });

    it('preserves whitespace in text parts', () => {
        const parts: AparteContentPart[] = [
            { type: 'text', text: '  hello  ' },
            { type: 'text', text: ' world' }
        ];
        expect(contentToText(parts)).toBe('  hello   world');
    });
});
