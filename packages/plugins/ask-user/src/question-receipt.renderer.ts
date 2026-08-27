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
        return `<div class="aparte-segment aparte-tag aparte-question-receipt" data-segment-id="${esc(seg.id)}">
  <span class="aparte-tag__label aparte-question-receipt__question">${esc(seg.question)}</span>
  <span class="aparte-question-receipt__sep">→</span>
  <span class="aparte-tag__label aparte-question-receipt__answer">${esc(seg.answer)}</span>
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
   itself. (No backticks in here: this whole block is a template literal.)

   THE CARD IS AN .aparte-tag. It is a pill holding a truncating label, which is what
   that recipe is, and it used to redeclare the whole thing: inline-flex, gap, padding,
   border, radius, surface background, max-width — nine lines that core already owned.
   What is left below is only what a tag has no opinion about (the entrance, and the
   share of the width each half gets) plus this card's own measures, expressed as the
   tag's tokens so they land ON the recipe rather than beside it.

   This is also the only place in the repo where a PLUGIN reaches core's recipes, and
   that is the point: the recipes are plain classes on a stylesheet core already ships,
   so a plugin needs no import, no client, and no build step to use them. A capability
   that only core itself can reach would not be one. */
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
    --aparte-tag-gap: var(--aparte-space-4);
    --aparte-tag-padding: var(--aparte-space-3) var(--aparte-space-6);
    --aparte-tag-radius: var(--aparte-radius-full);
    --aparte-tag-font-size: var(--aparte-font-size-md);
    overflow: hidden;
    animation: aparte-question-receipt-appear var(--aparte-duration-slow) ease-out both;
}
/* The question yields the room, the answer keeps it: an answer cut in half is a
   receipt that records nothing, and the question is usually the re-readable half. */
.aparte-question-receipt__question {
    color: var(--aparte-text-muted);
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
    font-weight: var(--aparte-font-weight-semibold);
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
