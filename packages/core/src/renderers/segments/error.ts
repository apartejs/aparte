/**
 * A failed turn, rendered in the transcript rather than thrown.
 *
 * One renderer, one file. They lived in a single 1900-line module because there was
 * nowhere else to put them; the registry that consumes them is in
 * `../segment-renderers.ts`.
 */
import { escapeHtml } from '../../utils/escape.js';
import { contextConfig } from '../../config/index.js';
import type {
    AparteSegmentRenderer,
    AparteErrorSegment,
} from '../../types/index.js';

export const errorRenderer: AparteSegmentRenderer<AparteErrorSegment> = {
    type: 'error',
    render: (segment) => {
        // A registered error renderer (aparteGlobalConfig.setErrorRenderer) owns the error
        // UI — the one place to customize it, string or live HTMLElement.
        const custom = contextConfig().getErrorRenderer?.();
        if (custom) {
            const out = custom({ message: segment.content, details: segment.details });
            if (out instanceof HTMLElement) {
                // Tag the root so in-place segment updates can still target it.
                out.setAttribute('data-segment-id', segment.id);
                return out;
            }
            return out;
        }
        return `
        <div class="aparte-segment aparte-segment-error" data-segment-id="${escapeHtml(segment.id)}">
            <div class="aparte-error-icon-wrapper">
                ${contextConfig().getIcon('error') || '⚠'}
            </div>
            <div class="aparte-error-content">
                <div class="aparte-error-title">${escapeHtml(contextConfig().t('error'))}</div>
                <div class="aparte-error-message">${escapeHtml(segment.content)}</div>
                ${segment.details ? `<div class="aparte-error-details">${escapeHtml(segment.details)}</div>` : ''}
            </div>
        </div>
    `;
    },
    /**
     * The icon and the heading. The heading used to be the hardcoded literal `Error`
     * while `locale.error` — a REQUIRED key, documented, and already translated to
     * "Erreur" — was read by nothing at all. A translated string with no consumer and
     * a literal with no translation, in the same card.
     *
     * Not the message: that is the model's or the transport's text, in whatever
     * language it arrived in. Relabelling it would be inventing content.
     */
    relabel: (element) => {
        const wrap = element.querySelector('.aparte-error-icon-wrapper');
        if (wrap) wrap.innerHTML = contextConfig().getIcon('error') || '⚠';
        const title = element.querySelector('.aparte-error-title');
        if (title) title.textContent = contextConfig().t('error');
    },

    getStyles: () => ``
};
