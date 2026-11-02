/**
 * Plain text — the streaming path, and the only renderer that owns a DOM host contract.
 *
 * One renderer, one file. They lived in a single 1900-line module because there was
 * nowhere else to put them; the registry that consumes them is in
 * `../segment-renderers.ts`.
 */
import { escapeHtml } from '../../utils/escape.js';
import { contextConfig } from '../../config/index.js';
import { writeStreamedMarkdown, highlightMarkdownFences, type AparteMarkdownStreamHost } from '../markdown-stream.js';
import { renderCodeLanguages } from '../code-languages.js';
import { renderCitations } from '../citations.js';
import type {
    AparteSegmentRenderer,
    AparteTextSegment,
} from '../../types/index.js';

/**
 * Text segment renderer.
 *
 * The incremental-vs-one-shot Markdown machinery lives in
 * `../markdown-stream.ts`, shared with the thinking renderer — see that file for
 * why appending beats rebuilding, and what the settling update flushes.
 */
export const textRenderer: AparteSegmentRenderer<AparteTextSegment> = {
    type: 'text',
    render: (segment) => `<div class="aparte-segment aparte-segment-text" data-segment-id="${escapeHtml(segment.id)}"><div class="aparte-segment-content" dir="auto">${contextConfig().renderMarkdown(segment.content)}</div></div>`,
    /*
     * A fence in a settled text segment is highlighted, as the thinking renderer does for
     * its own. The parser turns a streamed fence into a `code` segment, so this only ever
     * mattered for text built by hand (`setSegments`, a restored message, a server's) — and
     * the bubble's own pass skips any message that has segments, so that fence stayed bare.
     */
    setup: (el, segment) => {
        const contentEl = el.querySelector('.aparte-segment-content');
        // Only a segment marked streaming is still being written: one with no flag at all —
        // `setSegments`, an `appendMessage` with segments — is finished, and is highlighted.
        if (!contentEl) return;
        renderCodeLanguages(contentEl, { streaming: segment.isStreaming === true });
        if (segment.isStreaming !== true) highlightMarkdownFences(contentEl);
        renderCitations(contentEl as HTMLElement, segment);
    },
    update: (el, segment) => {
        const contentEl = el.querySelector('.aparte-segment-content');
        if (!contentEl) return;
        writeStreamedMarkdown(
            el as AparteMarkdownStreamHost,
            contentEl,
            segment.content,
            segment.isStreaming !== false,
        );
        if (segment.isStreaming === false) highlightMarkdownFences(contentEl);
        // Every write: the text a chip sat in may have been written anew.
        renderCitations(contentEl as HTMLElement, segment);
    },
    getStyles: () => ``
};
