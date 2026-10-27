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
import { renderCodeLanguages, isDrawnLanguage } from '../code-languages.js';
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
/** What each pane was last highlighted from, so a settled block re-synced unchanged is left alone. */
const highlighted = new WeakMap<Element, string>();

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
    // A framework re-sends the finished segment on every render: the same content in the
    // same language is the same highlight, already on screen.
    const what = `${segment.language ?? ''}\u0001${segment.content}`;
    if (highlighted.get(element) === what) return;
    highlighted.set(element, what);
    const turn = (generations.get(element) ?? 0) + 1;
    generations.set(element, turn);
    wrapper.dataset.aparteSettled = '';
    void contextConfig().highlightCode(segment.content, segment.language || '').then(html => {
        if (generations.get(element) !== turn) return;
        wrapper.innerHTML = html;
    }).catch(() => {
        // Best-effort: a failed highlight degrades silently, and the next settle tries again.
        if (generations.get(element) === turn) highlighted.delete(element);
    });
}

/** The fence's language: the first word of its info string (```` ```mermaid title ````). */
const languageOf = (segment: AparteCodeSegment): string => (segment.language || '').trim().split(/\s+/)[0] ?? '';

/**
 * Draw a fence whose language a renderer draws (`registerCodeLanguageRenderer`) — a
 * diagram rather than coloured code. The pane keeps a plain `<pre><code>` holding the
 * source, written as it streams, and the engine draws beside it. A highlight that ran
 * before the renderer was registered replaced that block, so it is put back.
 */
function drawSettledOrStreaming(element: HTMLElement, segment: AparteCodeSegment): void {
    const wrapper = element.querySelector<HTMLElement>('.aparte-code-content-wrapper');
    if (!wrapper) return;
    generations.set(element, (generations.get(element) ?? 0) + 1);   // a highlight in flight must not land
    wrapper.dataset.aparteSettled = '';
    const language = languageOf(segment);
    let code = Array.from(wrapper.querySelectorAll<HTMLElement>('pre > code'))
        .find((c) => c.classList.contains(`language-${language}`));
    if (!code) {
        wrapper.innerHTML = `<pre><code class="language-${escapeHtml(language)}"></code></pre>`;
        code = wrapper.querySelector<HTMLElement>('pre > code')!;
    }
    if (code.textContent !== segment.content) code.textContent = segment.content;
    renderCodeLanguages(wrapper, { streaming: segment.isStreaming === true });
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
        if (isDrawnLanguage(languageOf(segment), element)) drawSettledOrStreaming(element, segment);
        // A fence still arriving is painted by `update`; one already whole is highlighted now.
        else if (segment.isStreaming !== true) highlightSettled(element, segment);

        const copyBtn = element.querySelector<HTMLElement>('.aparte-code-copy');
        // Read the map, not the segment this closure captured: `setup` runs once, on the
        // segment as it is at that moment — for a streamed fence, empty.
        if (copyBtn) wireCopyButton(copyBtn, () => sources.get(element) ?? '');
    },
    update: (element, segment) => {
        sources.set(element, segment.content);
        if (isDrawnLanguage(languageOf(segment), element)) {
            drawSettledOrStreaming(element, segment);
        } else if (segment.isStreaming === true) {
            // Coloured WHILE it streams, so a fence is not grey until the stream ends.
            streamHighlight(element, '.aparte-code-content-wrapper', segment.content, segment.language || '', segment.id);
        } else {
            // Streaming complete — run the highlight provider for polished output.
            highlightSettled(element, segment);
        }
    },
    getStyles: () => ``
};
