/**
 * Fenced code — highlighted through the opt-in provider, plain when there is none.
 *
 * One renderer, one file; the registry that consumes them is in
 * `../segment-renderers.ts`.
 */
import { escapeHtml, escapeAttr } from '../../utils/escape.js';
import { copyText } from '../../utils/copy-text.js';
import { contextConfig } from '../../config/index.js';
import { streamHighlight } from '../highlight-stream.js';
import type {
    AparteSegmentRenderer,
    AparteCodeSegment,
} from '../../types/index.js';

/**
 * The tooltip and the accessible name are the same string and move together: an icon
 * button named by `title` alone has nothing for a screen reader to read, so both are set.
 */
function nameButton(button: HTMLElement, label: string): void {
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
}

export const codeRenderer: AparteSegmentRenderer<AparteCodeSegment> = {
    type: 'code',
    render: (segment) => `
        <div class="aparte-segment aparte-segment-code" data-segment-id="${escapeHtml(segment.id)}">
            <div class="aparte-code-header">
                ${segment.filename
                    ? `<span class="aparte-code-filename">${escapeHtml(segment.filename)}</span>`
                    : `<span class="aparte-code-header-filler"></span>`}
                <span class="aparte-code-language">${escapeHtml(segment.language || '')}</span>
                <button type="button" class="aparte-btn aparte-btn--icon aparte-btn--sm aparte-code-copy" data-action="copy" aria-label="${escapeAttr(contextConfig().t('copy'))}" title="${escapeAttr(contextConfig().t('copy'))}">
                    ${contextConfig().getIcon('copy')}
                </button>
            </div>
            <div class="aparte-code-content-wrapper">
                <pre><code class="language-${escapeHtml(segment.language || 'text')}">${escapeHtml(segment.content)}</code></pre>
            </div>
        </div>
    `,
    /** The copy button's icon and tooltip — nothing else here comes from config. */
    relabel: (element) => {
        const copyBtn = element.querySelector('.aparte-code-copy') as HTMLElement | null;
        // Leave a button mid-"copied" alone; its own timeout restores the resting
        // state from the new config a moment later anyway.
        if (!copyBtn || copyBtn.dataset.copied) return;
        nameButton(copyBtn, contextConfig().t('copy'));
        copyBtn.innerHTML = contextConfig().getIcon('copy');
    },
    setup: (element, segment) => {
        // Async highlight: replace plain <pre><code> with highlighted HTML once ready
        const wrapper = element.querySelector('.aparte-code-content-wrapper');
        if (wrapper) {
            void contextConfig().highlightCode(segment.content, segment.language || '').then(html => {
                wrapper.innerHTML = html;
            }).catch(() => { /* best-effort: a failed highlight degrades silently */ });
        }

        // Typed as HTMLElement: the confirmation is marked with a data attribute so
        // `relabel` can leave it alone, and `dataset` is not on `Element`.
        const copyBtn = element.querySelector('.aparte-code-copy') as HTMLElement | null;
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                // Read the DOM, not the segment this closure captured.
                //
                // `setup` runs once, on the segment as it is at that moment — for a
                // streamed fence, empty. The bubble replaces its segment object on every
                // `updateSegment` (`{...old, ...updates}`), so the captured one stays
                // frozen at creation and would copy an empty string.
                //
                // `textContent` is the source either way: the highlighter wraps it
                // in spans, which contribute no text.
                const source = element.querySelector('.aparte-code-content-wrapper')?.textContent ?? '';
                // Late execution (user click) — the ambient render config is
                // gone; resolve from the connected element instead.
                void copyText(source).catch(() => { /* best-effort: a failed clipboard write degrades silently */ });
                copyBtn.innerHTML = contextConfig(copyBtn).getIcon('check');
                nameButton(copyBtn, contextConfig(copyBtn).t('copied'));
                // Marked, so `relabel` does not cancel a confirmation the reader is
                // still looking at. The flag is also the only way to tell the two
                // states apart: they differ by title and icon alone, and after a
                // locale switch the old title matches nothing.
                copyBtn.dataset.copied = '1';
                setTimeout(() => {
                    copyBtn.innerHTML = contextConfig(copyBtn).getIcon('copy');
                    nameButton(copyBtn, contextConfig(copyBtn).t('copy'));
                    delete copyBtn.dataset.copied;
                }, 1500);
            });
        }
    },
    update: (element, segment) => {
        if (segment.isStreaming) {
            // Coloured WHILE it streams, so a fence is not grey until the stream ends.
            streamHighlight(element, '.aparte-code-content-wrapper', segment.content, segment.language || '', segment.id);
        } else {
            // Streaming complete — run the highlight provider for polished output.
            const wrapper = element.querySelector('.aparte-code-content-wrapper');
            if (wrapper) {
                void contextConfig().highlightCode(segment.content, segment.language || '').then(html => {
                    wrapper.innerHTML = html;
                }).catch(() => { /* best-effort: a failed highlight degrades silently */ });
            }
        }
    },
    getStyles: () => ``
};
