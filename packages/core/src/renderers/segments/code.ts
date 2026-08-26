/**
 * Fenced code — highlighted through the opt-in provider, plain when there is none.
 *
 * One renderer, one file. They lived in a single 1900-line module because there was
 * nowhere else to put them; the registry that consumes them is in
 * `../segment-renderers.ts`.
 */
import { escapeHtml } from '../../utils/escape.js';
import { controlMarkup } from '../../utils/control.js';
import { contextConfig } from '../../config/index.js';
import { streamHighlight } from '../highlight-stream.js';
import type {
    AparteSegmentRenderer,
    AparteCodeSegment,
} from '../../types/index.js';

export const codeRenderer: AparteSegmentRenderer<AparteCodeSegment> = {
    type: 'code',
    render: (segment) => `
        <div class="aparte-segment aparte-segment-code" data-segment-id="${escapeHtml(segment.id)}">
            <div class="aparte-code-header">
                ${segment.filename
                    ? `<span class="aparte-code-filename">${escapeHtml(segment.filename)}</span>`
                    : `<span class="aparte-code-header-filler"></span>`}
                <span class="aparte-code-language">${escapeHtml(segment.language || '')}</span>
                ${controlMarkup({
                    part: 'aparte-code-copy',
                    label: contextConfig().t('copy'),
                    icon: contextConfig().getIcon('copy'),
                    data: { action: 'copy' },
                })}
            </div>
            <div class="aparte-code-content-wrapper">
                <pre><code class="language-${escapeHtml(segment.language || 'text')}">${escapeHtml(segment.content)}</code></pre>
            </div>
        </div>
    `,
    /** The copy button's icon and tooltip — nothing else here comes from config. */
    relabel: (element) => {
        const copyBtn = element.querySelector('[data-aparte-control="aparte-code-copy"]') as HTMLElement | null;
        // Leave a button mid-"copied" alone; its own timeout restores the resting
        // state from the new config a moment later anyway.
        if (!copyBtn || copyBtn.dataset.copied) return;
        copyBtn.setAttribute('title', contextConfig().t('copy'));
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
        const copyBtn = element.querySelector('[data-aparte-control="aparte-code-copy"]') as HTMLElement | null;
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                // Read the DOM, not the segment this closure captured.
                //
                // `setup` runs once, on the segment as it was THEN — for a streamed
                // fence, empty. The bubble replaces its segment object on every
                // `updateSegment` (`{...old, ...updates}`), so the captured one is
                // frozen at creation and this button copied an empty string. It
                // passed for a long time by accident: the deltas arrived through
                // `appendToSegment`, which mutates in place, and the object was
                // only replaced late enough not to matter. Adding one more update
                // at the end of a turn was enough to expose it — measured, closure
                // 0 chars against 36 in the DOM.
                //
                // `textContent` is the source either way: the highlighter wraps it
                // in spans, which contribute no text. So this is also what makes
                // "the source, not the markup" true rather than lucky.
                const source = element.querySelector('.aparte-code-content-wrapper')?.textContent ?? '';
                // Late execution (user click) — the ambient render config is
                // gone; resolve from the connected element instead.
                void navigator.clipboard.writeText(source).catch(() => { /* best-effort: a failed clipboard write degrades silently */ });
                copyBtn.innerHTML = contextConfig(copyBtn).getIcon('check');
                copyBtn.setAttribute('title', contextConfig(copyBtn).t('copied'));
                // Marked, so `relabel` does not cancel a confirmation the reader is
                // still looking at. The flag is also the only way to tell the two
                // states apart: they differ by title and icon alone, and after a
                // locale switch the old title matches nothing.
                copyBtn.dataset.copied = '1';
                setTimeout(() => {
                    copyBtn.innerHTML = contextConfig(copyBtn).getIcon('copy');
                    copyBtn.setAttribute('title', contextConfig(copyBtn).t('copy'));
                    delete copyBtn.dataset.copied;
                }, 1500);
            });
        }
    },
    update: (element, segment) => {
        if (segment.isStreaming) {
            // Coloured WHILE it streams, which it was not: this branch used to write
            // plain text and leave every highlight to stream-end, so a fence appeared
            // grey and turned colour once, at the end. The artifact card had solved the
            // same problem, which made this renderer the outlier rather than the design.
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
