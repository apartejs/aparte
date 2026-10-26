/**
 * A failed turn, rendered in the transcript rather than thrown.
 *
 * One renderer, one file; the registry that consumes them is in
 * `../segment-renderers.ts`.
 */
import { escapeHtml, escapeAttr } from '../../utils/escape.js';
import { errorSentence } from '../../utils/error-sentence.js';
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
        const cfg = contextConfig();
        const sentence = errorSentence(segment.code, (key) => cfg.t(key));
        const custom = cfg.getErrorRenderer?.();
        if (custom) {
            const out = custom({
                message: segment.content,
                ...(sentence !== undefined ? { sentence } : {}),
                ...(segment.details !== undefined ? { details: segment.details } : {}),
                ...(segment.code !== undefined ? { code: segment.code } : {}),
            });
            if (out instanceof HTMLElement) {
                // Tag the root so in-place segment updates can still target it.
                out.setAttribute('data-segment-id', segment.id);
                return out;
            }
            return out;
        }
        // A sentence for the person, chosen by the code; the message stays on the segment
        // (and went to the console when the turn failed) for the developer.
        const message = sentence ?? segment.content;
        return `
        <div class="aparte-segment aparte-alert aparte-alert--danger aparte-segment-error" data-segment-id="${escapeHtml(segment.id)}"${segment.code ? ` data-error-code="${escapeAttr(segment.code)}"` : ''}>
            <span class="aparte-alert__icon">${cfg.getIcon('error') || '⚠'}</span>
            <div class="aparte-alert__body">
                <div class="aparte-alert__title">${escapeHtml(cfg.t('error'))}</div>
                <div class="aparte-alert__message">${escapeHtml(message)}</div>
                ${segment.details ? `<pre class="aparte-segment-error__details">${escapeHtml(segment.details)}</pre>` : ''}
            </div>
        </div>
    `;
    },
    /**
     * The icon, the heading (`locale.error`) and a sentence chosen by the code.
     *
     * Not a message the error keeps as its own: that is the app's, a setup error's or the
     * turn limit's text, in the language it was written in. Relabelling it would be
     * inventing content.
     */
    relabel: (element, segment) => {
        const cfg = contextConfig();
        // A custom renderer drew this card, words included: it is not core's to rewrite.
        if (cfg.getErrorRenderer?.()) return;
        const wrap = element.querySelector('.aparte-alert__icon');
        if (wrap) wrap.innerHTML = cfg.getIcon('error') || '⚠';
        const title = element.querySelector('.aparte-alert__title');
        if (title) title.textContent = cfg.t('error');
        const sentence = errorSentence(segment.code, (key) => cfg.t(key));
        const message = element.querySelector('.aparte-alert__message');
        if (message && sentence !== undefined) message.textContent = sentence;
    },

    getStyles: () => ``
};
