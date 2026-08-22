/**
 * The waiting indicator between pipeline stages.
 *
 * One renderer, one file. They lived in a single 1900-line module because there was
 * nowhere else to put them; the registry that consumes them is in
 * `../segment-renderers.ts`.
 */
import { escapeHtml } from '../../utils/escape.js';
import type {
    AparteSegmentRenderer,
} from '../../types/index.js';

export const pipelineWaitingRenderer: AparteSegmentRenderer = {
    type: 'pipeline-waiting',
    render: (segment) => {
        return `
        <div class="segment segment-pipeline-waiting" data-segment-id="${escapeHtml(segment.id)}" aria-label="Generating…" role="status">
            <span class="pw-dot"></span>
            <span class="pw-dot"></span>
            <span class="pw-dot"></span>
        </div>`;
    },
    update: () => { /* nothing to update */ },
    setup: (el) => {
        // Auto-remove when a sibling segment appears after this element.
        // This makes it a true "last-child only" segment — no manual removeSegment needed.
        const parent = el.parentElement;
        if (!parent) return;
        const observer = new MutationObserver(() => {
            if (el.nextElementSibling) {
                observer.disconnect();
                el.remove();
            }
        });
        observer.observe(parent, { childList: true });
    },
    getStyles: () => `
        .segment-pipeline-waiting {
            display: flex;
            align-items: center;
            gap: 5px;
            padding: 6px 2px;
            min-height: 28px;
        }
        .pw-dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--aparte-text-muted, #6b7280);
            opacity: 0.3;
            animation: pw-pulse 1.2s ease-in-out infinite;
        }
        .pw-dot:nth-child(2) { animation-delay: 0.2s; }
        .pw-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes pw-pulse {
            0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); }
            40%            { opacity: 1;   transform: scale(1.1);  }
        }
    `
};
