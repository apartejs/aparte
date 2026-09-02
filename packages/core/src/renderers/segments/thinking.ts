/**
 * Reasoning blocks — a collapsed disclosure the user can open.
 *
 * One renderer, one file. They lived in a single 1900-line module because there was
 * nowhere else to put them; the registry that consumes them is in
 * `../segment-renderers.ts`.
 */
import { escapeHtml, escapeAttr } from '../../utils/escape.js';
import { contextConfig } from '../../config/index.js';
import {
    writeStreamedMarkdown,
    highlightMarkdownFences,
    type AparteMarkdownStreamHost,
} from '../markdown-stream.js';
import type {
    AparteSegmentRenderer,
    AparteThinkingSegment,
} from '../../types/index.js';

/**
 * How far from the bottom still counts as "at the bottom", in px.
 *
 * Deliberately much tighter than the transcript's 50: this box is ~300px tall, so
 * 50 would call the last sixth of it "the bottom". One line of reasoning text is
 * about 20px (13px font, 1.55 line-height), and the slack exists for sub-pixel
 * layout rounding rather than for user intent — scrolling up by a single line is a
 * decision, and it disengages the anchor.
 */
const THINKING_ANCHOR_SLACK = 24;

export const thinkingRenderer: AparteSegmentRenderer<AparteThinkingSegment> = {
    type: 'thinking',
    /*
     * Markdown, like every other prose surface.
     *
     * The reasoning was rendered as escaped plain text in a `white-space: pre-wrap`
     * box, so a model that formats its thinking — headings, lists, `**bold**`, a
     * fenced snippet, which is most of them — showed its own syntax as literal
     * characters. Nothing said that was deliberate; it read as one, because the
     * `pre-wrap` made it look like a chosen preformatted block.
     *
     * `renderMarkdown` sanitizes its provider's output before it reaches innerHTML,
     * so this is exactly the text renderer's path, with the same guarantees and no
     * new class of risk. With no Markdown provider registered it degrades to the
     * zero-dependency default (escape + `<br>`), which is what it used to be.
     */
    /*
     * WEARS THE ACCORDION RECIPE. A reasoning block is a disclosure — `<details>`, a
     * `<summary>` you press, a panel, a chevron that turns — which is exactly what
     * `surface/accordion.css` already draws, and this renderer used to draw a second
     * time under four classes of its own. Two costs, both visible: it looked unrelated
     * to every other disclosure in the library, and its chevron was the CHARACTER `▼`,
     * a fourth way to draw a chevron here and the only one that is not a glyph — so it
     * could not take `--aparte-icon-size`, could not be replaced through the icon
     * provider, and rendered in whatever the platform font felt like.
     *
     * What stays thinking's own is the left rail and the quieter tone, which is the
     * only part that is genuinely about reasoning rather than about disclosure.
     * `.aparte-thinking-label` stays too: `relabel` below queries it.
     */
    render: (segment) => `<details class="aparte-segment aparte-segment-thinking aparte-accordion__item" data-segment-id="${escapeHtml(segment.id)}" ${segment.collapsed === false ? 'open' : ''}><summary class="aparte-accordion__header aparte-thinking-header"><span class="aparte-thinking-label">${escapeHtml(segment.label || contextConfig().t('thinking'))}</span><span class="aparte-accordion__icon">${contextConfig().getIcon('expand')}</span></summary><div class="aparte-accordion__panel aparte-thinking-content" role="region" tabindex="0" aria-label="${escapeAttr(segment.label || contextConfig().t('thinking'))}">${contextConfig().renderMarkdown(segment.content)}</div></details>`,
    /**
     * The default label is the only config-derived text here — and `segment.label`
     * still wins, exactly as in `render`, because that string is the app's.
     */
    relabel: (el, segment) => {
        const text = segment.label || contextConfig().t('thinking');
        const label = el.querySelector('.aparte-thinking-label');
        if (label) label.textContent = text;
        el.querySelector('.aparte-thinking-content')?.setAttribute('aria-label', text);
    },
    update: (el, segment) => {
        // collapsed state is managed by _applySegmentUpdate based on explicit updates only —
        // never override what the user set by clicking <summary>
        const contentEl = el.querySelector('.aparte-thinking-content');
        if (!contentEl) return;

        // Anchor to the bottom while the reasoning streams — but only if the reader
        // was already there.
        //
        // `.aparte-thinking-content` is its own scroll container (`max-height` +
        // `overflow-y: auto`), and this update replaced its text without touching
        // `scrollTop`. So every delta pushed the newest line below the fold and the
        // block sat frozen on the first 300px of a reasoning trace that kept
        // growing. Same rule as the transcript itself: follow the stream, unless the
        // reader has scrolled up to read — then leave their position alone. No
        // scroll-to-bottom button; being at the bottom is the whole signal.
        //
        // The measurement MUST happen before the write. Afterwards `scrollHeight`
        // has already grown by the new text, so the distance to the bottom is
        // whatever just arrived and the answer is always "not at the bottom" — the
        // block would then anchor exactly never. The transcript's own scroll
        // handling cost five wrong attempts on this ordering; it is written down
        // here so the sixth is not in this file.
        const wasAtBottom =
            contentEl.scrollHeight - contentEl.scrollTop - contentEl.clientHeight <= THINKING_ANCHOR_SLACK;

        const streaming = segment.isStreaming !== false;
        writeStreamedMarkdown(el as AparteMarkdownStreamHost, contentEl, segment.content, streaming);

        // Highlight on settle only, exactly like the code renderer: running a
        // highlighter on every token is the paint storm the incremental writer
        // exists to avoid. A fence inside reasoning is not a `code` SEGMENT — the
        // parser accumulates a thinking block raw until its closing delimiter — so
        // without this it would be the one code block in the transcript with no
        // highlighting. No copy button here: that would need real nested segments,
        // which is a design change and not this fix.
        if (!streaming) highlightMarkdownFences(contentEl);

        if (wasAtBottom) contentEl.scrollTop = contentEl.scrollHeight;
    },
    getStyles: () => ``
};
