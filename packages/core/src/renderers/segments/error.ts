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

/** Core's card: the icon, the heading, the sentence the code reads as, and the details. */
function defaultCard(segment: AparteErrorSegment, sentence: string | undefined, cfg: ReturnType<typeof contextConfig>): string {
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
}

/**
 * The cards core drew while an error renderer was registered, because it handed the error
 * back with `null`. Only these follow a language switch then: a card of the app's is not
 * core's to rewrite, even one that wears core's classes.
 */
const handedBack = new WeakSet<Element>();

export const errorRenderer: AparteSegmentRenderer<AparteErrorSegment> = {
    type: 'error',
    render: (segment) => {
        // A registered error renderer (aparteGlobalConfig.setErrorRenderer) owns the error
        // UI — the one place to customize it, string or live HTMLElement — for the errors it
        // answers. `null` or nothing hands one back to core's card.
        const cfg = contextConfig();
        const sentence = errorSentence(segment.code, (key) => cfg.t(key));
        const custom = cfg.getErrorRenderer?.();
        if (custom) {
            const out = custom({
                message: segment.content,
                ...(sentence !== undefined ? { sentence } : {}),
                ...(segment.details !== undefined ? { details: segment.details } : {}),
                ...(segment.code !== undefined ? { code: segment.code } : {}),
                ...(segment.appCode !== undefined ? { appCode: segment.appCode } : {}),
            });
            if (out instanceof HTMLElement) {
                // Tag the root so in-place segment updates can still target it.
                out.setAttribute('data-segment-id', segment.id);
                return out;
            }
            if (typeof out === 'string') return out;
            // Handed back. An element rather than markup, so the language switch can tell
            // this card from the app's own.
            const holder = document.createElement('div');
            holder.innerHTML = defaultCard(segment, sentence, cfg); // safe-text: core's own card, every value escaped in defaultCard
            const card = holder.firstElementChild as HTMLElement;
            handedBack.add(card);
            return card;
        }
        return defaultCard(segment, sentence, cfg);
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
        // A custom renderer drew this card, words included: it is not core's to rewrite,
        // unless the renderer handed this one back to core.
        if (cfg.getErrorRenderer?.() && !handedBack.has(element)) return;
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
