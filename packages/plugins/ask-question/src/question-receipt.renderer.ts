import type { AparteSegmentRenderer } from '@aparte/core';

export interface QuestionReceiptSegment {
    id: string;
    type: 'question-receipt';
    isStreaming?: boolean;
    question: string;
    answer: string;
}

function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export const questionReceiptRenderer: AparteSegmentRenderer<QuestionReceiptSegment> = {
    type: 'question-receipt',

    render(seg) {
        return `<div class="segment seg-qreceipt" data-segment-id="${esc(seg.id)}">
  <span class="qr-question">${esc(seg.question)}</span>
  <span class="qr-sep">→</span>
  <span class="qr-answer">${esc(seg.answer)}</span>
</div>`;
    },

    update(el, seg) {
        const q = el.querySelector('.qr-question');
        if (q) q.textContent = seg.question;
        const a = el.querySelector('.qr-answer');
        if (a) a.textContent = seg.answer;
    },

    getStyles() {
        return `
/* ── Question Receipt Card ──────────────────────────────────────────────── */
.seg-qreceipt {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: var(--aparte-radius-full);
    background: var(--aparte-surface-2);
    border: 1px solid var(--aparte-border);
    font-size: 0.8rem;
    max-width: 100%;
    overflow: hidden;
    animation: qr-appear 0.2s ease-out both;
}
.qr-question {
    color: var(--aparte-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
    min-width: 0;
}
.qr-sep {
    color: var(--aparte-text-muted);
    opacity: 0.4;
    flex-shrink: 0;
}
.qr-answer {
    color: var(--aparte-success);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
    max-width: 55%;
}
@keyframes qr-appear {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
}
`;
    },
};
