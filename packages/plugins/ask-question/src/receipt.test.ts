// @vitest-environment jsdom
/**
 * The conversation keeps the record.
 *
 * The panel lives in the composer, so once it is answered it is gone — and the
 * tool renderer for `ask_question` was `render: () => ''`, "it is a UI-only tool".
 * So scrolling back showed nothing: no question, no answer, no sign the assistant
 * had asked anything at all. Reported from a real session, and the pieces were all
 * present and wired to nothing: `questionReceiptRenderer` had its own markup, styles
 * and eleven tests, exported and registered by nobody.
 */
import { describe, it, expect } from 'vitest';
import { buildReceipt, receiptRows } from './receipt.js';

describe('the record a question leaves in the transcript', () => {
    it('is empty while the question is still open', () => {
        // The live UI is the panel in the composer. A copy of the pending question in
        // the bubble would be two places to read the same thing.
        const el = buildReceipt({ input: { question: 'Colour?' } });
        expect(el.querySelector('.seg-qreceipt')).toBeNull();
    });

    it('pairs a single question with the answer', () => {
        const rows = receiptRows({ input: { question: 'Colour?' }, result: 'Blue' });
        expect(rows).toEqual([{ question: 'Colour?', answer: 'Blue' }]);
    });

    it('pairs each question of a form with its own answer', () => {
        const rows = receiptRows({
            input: { questions: [{ question: 'Colour?' }, { question: 'Shape?' }] },
            result: 'Colour? → Blue\nShape? → Round',
        });
        expect(rows).toEqual([
            { question: 'Colour?', answer: 'Blue' },
            { question: 'Shape?', answer: 'Round' },
        ]);
    });

    it('takes the questions from the INPUT, so an arrow in an answer changes nothing', () => {
        // The answer can be free text the user typed. The questions are authoritative
        // because they come from the call, not from the formatted string.
        const rows = receiptRows({
            input: { questions: [{ question: 'Colour?' }, { question: 'Shape?' }] },
            result: 'Colour? → blue → then green\nShape? → Round',
        });
        expect(rows[0]).toEqual({ question: 'Colour?', answer: 'blue → then green' });
        expect(rows[1]?.question).toBe('Shape?');
    });

    it('renders one card per question, as text and never as markup', () => {
        const el = buildReceipt({
            input: { questions: [{ question: '<b>Colour?</b>' }, { question: 'Shape?' }] },
            result: '<b>Colour?</b> → <img src=x onerror=alert(1)>\nShape? → Round',
        });

        const cards = el.querySelectorAll('.seg-qreceipt');
        expect(cards).toHaveLength(2);
        // Everything here is model-chosen or user-typed. The element arm of the tool
        // renderer has no innerHTML surface at all, which is why this is built with
        // `textContent` — the string arm's first natural line is a model-to-DOM XSS.
        expect(el.querySelector('img'), 'no live element from a hostile answer').toBeNull();
        expect(el.querySelector('b'), 'nor from a hostile question').toBeNull();
        expect(cards[0]!.querySelector('.qr-question')!.textContent).toBe('<b>Colour?</b>');
        expect(cards[0]!.querySelector('.qr-answer')!.textContent).toBe('<img src=x onerror=alert(1)>');
    });

    it('survives a result that has fewer lines than questions', () => {
        // A handler that declined mid-form, or a model that changed its mind: the row
        // is empty rather than the render throwing.
        const rows = receiptRows({
            input: { questions: [{ question: 'A?' }, { question: 'B?' }] },
            result: 'A? → x',
        });
        expect(rows).toHaveLength(2);
        expect(rows[1]).toEqual({ question: 'B?', answer: '' });
    });
});
