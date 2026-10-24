/**
 * Fenced code — highlighted through the opt-in provider, plain when there is none.
 *
 * One renderer, one file; the registry that consumes them is in
 * `../segment-renderers.ts`.
 */
import { escapeHtml } from '../../utils/escape.js';
import { contextConfig } from '../../config/index.js';
import { copyButtonMarkup, wireCopyButton, relabelCopyButton } from '../copy-button.js';
import { streamHighlight } from '../highlight-stream.js';
import type {
    AparteSegmentRenderer,
    AparteCodeSegment,
} from '../../types/index.js';

export const codeRenderer: AparteSegmentRenderer<AparteCodeSegment> = {
    type: 'code',
    render: (segment) => {
        const copy = copyButtonMarkup('aparte-code-copy');  // safe-text: markup built by copyButtonMarkup, whose own interpolations are each escaped or marked there
        return `
        <div class="aparte-segment aparte-segment-code" data-segment-id="${escapeHtml(segment.id)}">
            <div class="aparte-code-header">
                ${segment.filename
                    ? `<span class="aparte-code-filename">${escapeHtml(segment.filename)}</span>`
                    : `<span class="aparte-code-header-filler"></span>`}
                <span class="aparte-code-language">${escapeHtml(segment.language || '')}</span>
                ${copy}
            </div>
            <div class="aparte-code-content-wrapper">
                <pre><code class="language-${escapeHtml(segment.language || 'text')}">${escapeHtml(segment.content)}</code></pre>
            </div>
        </div>
    `;
    },
    /** The copy button's icon and tooltip — nothing else here comes from config. */
    relabel: (element) => {
        const copyBtn = element.querySelector<HTMLElement>('.aparte-code-copy');
        if (copyBtn) relabelCopyButton(copyBtn);
    },
    setup: (element, segment) => {
        // Async highlight: replace plain <pre><code> with highlighted HTML once ready
        const wrapper = element.querySelector('.aparte-code-content-wrapper');
        if (wrapper) {
            void contextConfig().highlightCode(segment.content, segment.language || '').then(html => {
                wrapper.innerHTML = html;
            }).catch(() => { /* best-effort: a failed highlight degrades silently */ });
        }

        const copyBtn = element.querySelector<HTMLElement>('.aparte-code-copy');
        // Read the DOM, not the segment this closure captured: `setup` runs once, on the
        // segment as it is at that moment — for a streamed fence, empty. `textContent`
        // is the source either way: the highlighter wraps it in spans, which add no text.
        if (copyBtn) wireCopyButton(copyBtn, () => element.querySelector('.aparte-code-content-wrapper')?.textContent ?? '');
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
