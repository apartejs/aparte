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
        <div class="aparte-segment aparte-alert aparte-alert--danger aparte-segment-error" data-segment-id="${escapeHtml(segment.id)}">
            <span class="aparte-alert__icon">${contextConfig().getIcon('error') || '⚠'}</span>
            <div class="aparte-alert__body">
                <div class="aparte-alert__title">${escapeHtml(contextConfig().t('error'))}</div>
                <div class="aparte-alert__message">${escapeHtml(segment.content)}</div>
                ${segment.details ? `<pre class="aparte-segment-error__details">${escapeHtml(segment.details)}</pre>` : ''}
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
        const wrap = element.querySelector('.aparte-alert__icon');
        if (wrap) wrap.innerHTML = contextConfig().getIcon('error') || '⚠';
        const title = element.querySelector('.aparte-alert__title');
        if (title) title.textContent = contextConfig().t('error');
    },

    getStyles: () => ``
};
