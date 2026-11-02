/**
 * Reasoning blocks — a collapsed disclosure the user can open.
 *
 * One renderer, one file. They lived in a single 1900-line module because there was
 * nowhere else to put them; the registry that consumes them is in
 * `../segment-renderers.ts`.
 */
import { escapeHtml, escapeAttr } from '../../utils/escape.js';
import { contextConfig } from '../../config/index.js';
import { isSegmentSettled, segmentDuration } from '../../utils/segments.js';
import { formatDuration } from '../../utils/format-duration.js';
import {
    writeStreamedMarkdown,
    highlightMarkdownFences,
    type AparteMarkdownStreamHost,
} from '../markdown-stream.js';
import { renderCodeLanguages } from '../code-languages.js';
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

/**
 * A block's own label, else the locale's. `'Thinking'` counts as none: streamed blocks carried
 * that English literal until 0.19.3, and a conversation saved then would keep it in every locale.
 *
 * The locale's label says where the block is: "Thinking" while it streams, "Thought" once
 * settled — a block that finished must not read as one still running. How long it took
 * ("Thought for 8s") only when the app asked (`showDuration`): the number is measured
 * here, in the browser, and is the model's thinking time only when its reasoning streams.
 */
function labelOf(segment: AparteThinkingSegment): string {
    if (segment.label && segment.label !== 'Thinking') return segment.label;
    const cfg = contextConfig();
    if (!isSegmentSettled(segment)) return cfg.t('thinking');
    // The block's own field, else the default — read HERE, not only written at insertion: a
    // block restored from storage never passed through insertion, and a display setting
    // must reach it both ways.
    const show = segment.showDuration ?? cfg.getSegmentDefaults('thinking')?.['showDuration'] === true;
    const ms = show ? segmentDuration(segment) : undefined;
    if (ms === undefined) return cfg.t('thought');
    return cfg.t('thoughtFor').replace('{duration}', () => formatDuration(ms, cfg.getLocale().tag || undefined));
}

/**
 * Whether the block is arriving now, for the shimmer on its label: the streaming flag the
 * viewport and the parser set as text comes in. `true` only — a block written by hand or
 * restored from storage never streamed here, and a light sweeping across it would say it
 * is still running when nothing is.
 */
const arriving = (segment: AparteThinkingSegment): boolean => segment.isStreaming === true;

/** Write the label where it shows, and where the panel is named after it. */
function setLabel(el: Element, segment: AparteThinkingSegment): void {
    const text = labelOf(segment);
    const label = el.querySelector('.aparte-thinking-label');
    if (label && label.textContent !== text) label.textContent = text;
    label?.classList.toggle('aparte-shimmer', arriving(segment));
    el.querySelector('.aparte-thinking-content')?.setAttribute('aria-label', text);
}

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
    render: (segment) => `<details class="aparte-segment aparte-segment-thinking aparte-accordion__item" data-segment-id="${escapeHtml(segment.id)}" ${segment.collapsed === false ? 'open' : ''}><summary class="aparte-accordion__header aparte-thinking-header"><span class="aparte-thinking-label${escapeAttr(arriving(segment) ? ' aparte-shimmer' : '')}">${escapeHtml(labelOf(segment))}</span><span class="aparte-accordion__icon">${contextConfig().getIcon('expand')}</span></summary><div class="aparte-accordion__panel aparte-thinking-content" dir="auto" role="region" tabindex="0" aria-label="${escapeAttr(labelOf(segment))}">${contextConfig().renderMarkdown(segment.content)}</div></details>`,
    /**
     * The default label is the only config-derived text here — and `segment.label`
     * still wins, exactly as in `render`, because that string is the app's.
     */
    relabel: (el, segment) => setLabel(el, segment),
    /** A block restored from storage is drawn here: `update` only runs on one that changes. */
    setup: (el, segment) => {
        const contentEl = el.querySelector('.aparte-thinking-content');
        if (contentEl) renderCodeLanguages(contentEl, { streaming: arriving(segment) });
    },
    update: (el, segment) => {
        // The label follows the block: "Thinking" becomes its duration when it settles.
        setLabel(el, segment);
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
