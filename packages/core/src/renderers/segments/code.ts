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

/**
 * The source each pane shows, for the copy button: the pane's text stops being the
 * source as soon as something other than a highlighter draws into it.
 */
const sources = new WeakMap<Element, string>();
/** Each whole-content highlight's turn: one resolving after a newer one must not land. */
const generations = new WeakMap<Element, number>();

/**
 * Highlight the whole content, once the segment has settled.
 *
 * The pane is marked settled first, so a streaming highlight still in flight
 * (`streamHighlight`) leaves it alone, and each call takes a turn, so two of these
 * resolving out of order cannot put the older content back.
 */
function highlightSettled(element: HTMLElement, segment: AparteCodeSegment): void {
    const wrapper = element.querySelector<HTMLElement>('.aparte-code-content-wrapper');
    if (!wrapper) return;
    const turn = (generations.get(element) ?? 0) + 1;
    generations.set(element, turn);
    wrapper.dataset.aparteSettled = '';
    void contextConfig().highlightCode(segment.content, segment.language || '').then(html => {
        if (generations.get(element) !== turn) return;
        wrapper.innerHTML = html;
    }).catch(() => { /* best-effort: a failed highlight degrades silently */ });
}

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
        sources.set(element, segment.content);
        // A fence still arriving is painted by `update`; one already whole is highlighted now.
        if (segment.isStreaming !== true) highlightSettled(element, segment);

        const copyBtn = element.querySelector<HTMLElement>('.aparte-code-copy');
        // Read the map, not the segment this closure captured: `setup` runs once, on the
        // segment as it is at that moment — for a streamed fence, empty.
        if (copyBtn) wireCopyButton(copyBtn, () => sources.get(element) ?? '');
    },
    update: (element, segment) => {
        sources.set(element, segment.content);
        if (segment.isStreaming === true) {
            // Coloured WHILE it streams, so a fence is not grey until the stream ends.
            streamHighlight(element, '.aparte-code-content-wrapper', segment.content, segment.language || '', segment.id);
        } else {
            // Streaming complete — run the highlight provider for polished output.
            highlightSettled(element, segment);
        }
    },
    getStyles: () => ``
};
