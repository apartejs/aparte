import type { AparteSegmentRenderer } from '@aparte/core';
import { escapeAttr } from '@aparte/core';

export interface QuestionReceiptSegment {
    id: string;
    type: 'question-receipt';
    isStreaming?: boolean;
    question: string;
    answer: string;
}

// Core owns the escaping; this alias keeps the call sites short. The inlined
// copy that used to live here left the apostrophe through.
const esc = escapeAttr;

export const questionReceiptRenderer: AparteSegmentRenderer<QuestionReceiptSegment> = {
    type: 'question-receipt',

    render(seg) {
        return `<div class="aparte-segment aparte-question-receipt" data-segment-id="${esc(seg.id)}">
  <span class="aparte-question-receipt__question">${esc(seg.question)}</span>
  <span class="aparte-question-receipt__sep">→</span>
  <span class="aparte-question-receipt__answer">${esc(seg.answer)}</span>
</div>`;
    },

    update(el, seg) {
        const q = el.querySelector('.aparte-question-receipt__question');
        if (q) q.textContent = seg.question;
        const a = el.querySelector('.aparte-question-receipt__answer');
        if (a) a.textContent = seg.answer;
    },

    getStyles() {
        return `
/* ── Question Receipt Card ──────────────────────────────────────────────── */
/* Several questions leave several cards, stacked. The tool renderer builds this
   group; the card below is shared with a question-receipt segment an app emits
   itself. (No backticks in here: this whole block is a template literal.) */
/* A declined request: the outcome, in the muted voice of something that did not
   happen — not the green of an answer given. */
.aparte-question-receipt__answer--declined {
    color: var(--aparte-text-muted);
    font-style: italic;
}
.aparte-question-receipt__group {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--aparte-space-2);
}
.aparte-question-receipt {
    display: inline-flex;
    align-items: center;
    gap: var(--aparte-space-4);
    padding: var(--aparte-space-3) var(--aparte-space-6);
    border-radius: var(--aparte-radius-full);
    background: var(--aparte-surface-2);
    border: var(--aparte-border-width) solid var(--aparte-border);
    font-size: 0.8rem;
    max-width: 100%;
    overflow: hidden;
    animation: aparte-question-receipt-appear var(--aparte-duration-slow) ease-out both;
}
.aparte-question-receipt__question {
    color: var(--aparte-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
    min-width: 0;
}
.aparte-question-receipt__sep {
    color: var(--aparte-text-muted);
    opacity: 0.4;
    flex-shrink: 0;
}
.aparte-question-receipt__answer {
    color: var(--aparte-success);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
    max-width: 55%;
}
@keyframes aparte-question-receipt-appear {
    from { opacity: 0; transform: translateY(var(--aparte-space-2)); }
    to   { opacity: 1; transform: translateY(0); }
}
`;
    },
};
