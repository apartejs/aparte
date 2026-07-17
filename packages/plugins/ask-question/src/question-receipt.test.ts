// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { questionReceiptRenderer } from './question-receipt.renderer.js';

describe('questionReceiptRenderer', () => {
    it('has type question-receipt', () => {
        expect(questionReceiptRenderer.type).toBe('question-receipt');
    });

    describe('render()', () => {
        const seg = { id: 'seg-1', type: 'question-receipt' as const, question: 'Which model?', answer: 'GPT' };

        it('includes the segment id', () => {
            expect(questionReceiptRenderer.render(seg)).toContain('data-segment-id="seg-1"');
        });

        it('renders the question text', () => {
            expect(questionReceiptRenderer.render(seg)).toContain('Which model?');
        });

        it('renders the answer text', () => {
            expect(questionReceiptRenderer.render(seg)).toContain('GPT');
        });

        it('escapes HTML entities in the question', () => {
            const evil = { ...seg, question: '<script>alert("xss")</script>' };
            const html = questionReceiptRenderer.render(evil);
            expect(html).not.toContain('<script>');
            expect(html).toContain('&lt;script&gt;');
        });

        it('escapes HTML entities in the answer', () => {
            const evil = { ...seg, answer: '1 < 2 & 3 > 0' };
            const html = questionReceiptRenderer.render(evil);
            expect(html).toContain('1 &lt; 2 &amp; 3 &gt; 0');
        });
    });

    describe('update()', () => {
        it('updates the question text', () => {
            const el = document.createElement('div');
            el.innerHTML = '<span class="qr-question">old q</span><span class="qr-sep">→</span><span class="qr-answer">old a</span>';
            const seg = { id: 'seg-1', type: 'question-receipt' as const, question: 'New question', answer: 'old a' };
            questionReceiptRenderer.update!(el, seg);
            expect(el.querySelector('.qr-question')!.textContent).toBe('New question');
        });

        it('updates the answer text', () => {
            const el = document.createElement('div');
            el.innerHTML = '<span class="qr-question">q</span><span class="qr-sep">→</span><span class="qr-answer">old</span>';
            const seg = { id: 'seg-1', type: 'question-receipt' as const, question: 'q', answer: 'New answer' };
            questionReceiptRenderer.update!(el, seg);
            expect(el.querySelector('.qr-answer')!.textContent).toBe('New answer');
        });

        it('is a no-op when elements are missing', () => {
            const el = document.createElement('div');
            const seg = { id: 'seg-1', type: 'question-receipt' as const, question: 'q', answer: 'a' };
            expect(() => questionReceiptRenderer.update!(el, seg)).not.toThrow();
        });
    });

    describe('getStyles()', () => {
        it('returns a non-empty string', () => {
            expect(typeof questionReceiptRenderer.getStyles!()).toBe('string');
            expect(questionReceiptRenderer.getStyles!().length).toBeGreaterThan(0);
        });

        it('contains the seg-qreceipt selector', () => {
            expect(questionReceiptRenderer.getStyles!()).toContain('.seg-qreceipt');
        });
    });
});
