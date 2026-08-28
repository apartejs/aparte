// @vitest-environment jsdom
/**
 * The conversation keeps the record.
 *
 * The panel lives in the composer, so once it is answered it is gone — and the
 * tool renderer for `ask_user` was `render: () => ''`, "it is a UI-only tool".
 * So scrolling back showed nothing: no question, no answer, no sign the assistant
 * had asked anything at all. Reported from a real session, and the pieces were all
 * present and wired to nothing: `questionReceiptRenderer` had its own markup, styles
 * and eleven tests, exported and registered by nobody.
 */
import { describe, it, expect } from 'vitest';
import { buildReceipt, receiptRows } from './receipt.js';
import { ASK_USER_DECLINED } from './ask-user.js';

describe('the record a question leaves in the transcript', () => {
    it('is empty while the question is still open', () => {
        // The live UI is the panel in the composer. A copy of the pending question in
        // the bubble would be two places to read the same thing.
        const el = buildReceipt({ input: { question: 'Colour?' } });
        expect(el.querySelector('.aparte-question-receipt')).toBeNull();
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

        const cards = el.querySelectorAll('.aparte-question-receipt');
        expect(cards).toHaveLength(2);
        // Everything here is model-chosen or user-typed. The element arm of the tool
        // renderer has no innerHTML surface at all, which is why this is built with
        // `textContent` — the string arm's first natural line is a model-to-DOM XSS.
        expect(el.querySelector('img'), 'no live element from a hostile answer').toBeNull();
        expect(el.querySelector('b'), 'nor from a hostile question').toBeNull();
        expect(cards[0]!.querySelector('.aparte-question-receipt__question')!.textContent).toBe('<b>Colour?</b>');
        expect(cards[0]!.querySelector('.aparte-question-receipt__answer')!.textContent).toBe('<img src=x onerror=alert(1)>');
    });

    /**
     * Declining is a whole-request outcome.
     *
     * `Don't answer` declines everything — MCP's `decline`, including questions
     * already answered, which is the right behaviour. The receipt used to SPLIT that
     * sentence as though it were the answer to the first question, leaving the others
     * blank: reported from a real session as one row reading
     * "Quelle est ta couleur préférée ? → The user declined to answer." beside an
     * empty one. That is worse than wrong — it attributes words to the user.
     */
    it('renders a decline as ONE outcome, not as an answer to the first question', () => {
        const rows = receiptRows({
            input: { questions: [{ question: 'Colour?' }, { question: 'Shape?' }] },
            result: ASK_USER_DECLINED,
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]!.declined).toBe(true);
        expect(rows[0]!.question, 'no question owns this').toBe('');
        expect(rows[0]!.answer).toBe(ASK_USER_DECLINED);
    });

    it('the declined card has no question and no arrow', () => {
        const el = buildReceipt({
            input: { questions: [{ question: 'Colour?' }, { question: 'Shape?' }] },
            result: ASK_USER_DECLINED,
        });

        expect(el.querySelectorAll('.aparte-question-receipt')).toHaveLength(1);
        expect(el.querySelector('.aparte-question-receipt__question'), 'nothing to attribute').toBeNull();
        expect(el.querySelector('.aparte-question-receipt__sep'), 'nothing points at anything').toBeNull();
        expect(el.querySelector('.aparte-question-receipt__answer--declined')!.textContent).toBe(ASK_USER_DECLINED);
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

// The card wears core's mark: an answer given is the row the choice landed on, a
// decline is the outcome that did not happen. Same recipe as a chosen option in a
// dropdown — the classes are core's, the plugin only puts them on.
describe('the mark the receipt wears', () => {
    it('an answered card is marked success', () => {
        const el = buildReceipt({ input: { question: 'Colour?' }, result: 'Blue' });
        const card = el.querySelector('.aparte-question-receipt')!;
        expect(card.classList.contains('aparte-mark')).toBe(true);
        expect(card.classList.contains('aparte-mark--success')).toBe(true);
        expect(card.classList.contains('aparte-mark--quiet')).toBe(false);
    });

    it('a declined card is marked quiet', () => {
        const el = buildReceipt({ input: { question: 'Colour?' }, result: ASK_USER_DECLINED });
        const card = el.querySelector('.aparte-question-receipt')!;
        expect(card.classList.contains('aparte-mark--quiet')).toBe(true);
        expect(card.classList.contains('aparte-mark--success')).toBe(false);
    });
});
