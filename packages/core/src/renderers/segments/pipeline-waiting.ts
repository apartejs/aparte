/**
 * The waiting indicator between pipeline stages.
 *
 * One renderer, one file. They lived in a single 1900-line module because there was
 * nowhere else to put them; the registry that consumes them is in
 * `../segment-renderers.ts`.
 */
import { escapeHtml, escapeAttr } from '../../utils/escape.js';
import { contextConfig } from '../../config/index.js';
import type {
    AparteSegmentRenderer,
} from '../../types/index.js';

/** The one string this segment has, and the only thing a screen reader gets from it. */
const waitingLabel = (): string => contextConfig().getLocale().generating ?? 'Generating…';

export const pipelineWaitingRenderer: AparteSegmentRenderer = {
    type: 'pipeline-waiting',
    render: (segment) => {
        return `
        <div class="segment segment-pipeline-waiting" data-segment-id="${escapeHtml(segment.id)}" aria-label="${escapeAttr(waitingLabel())}" role="status">
            <span class="pw-dot"></span>
            <span class="pw-dot"></span>
            <span class="pw-dot"></span>
        </div>`;
    },
    update: () => { /* nothing to update */ },
    /**
     * Three dots and an accessible name. The dots are CSS; the name is the whole
     * content as far as a screen reader is concerned, and it was hardcoded English in
     * every locale — the one string in this library where being untranslated is
     * invisible to everyone who can see the screen.
     */
    relabel: (element) => {
        element.setAttribute('aria-label', waitingLabel());
    },
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
