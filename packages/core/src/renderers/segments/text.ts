/**
 * Plain text — the streaming path, and the only renderer that owns a DOM host contract.
 *
 * One renderer, one file. They lived in a single 1900-line module because there was
 * nowhere else to put them; the registry that consumes them is in
 * `../segment-renderers.ts`.
 */
import { escapeHtml } from '../../utils/escape.js';
import { contextConfig } from '../../config/index.js';
import { writeStreamedMarkdown, type AparteMarkdownStreamHost } from '../markdown-stream.js';
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
    render: (segment) => `<div class="segment segment-text" data-segment-id="${escapeHtml(segment.id)}"><div class="segment-content">${contextConfig().renderMarkdown(segment.content)}</div></div>`,
    update: (el, segment) => {
        const contentEl = el.querySelector('.segment-content');
        if (!contentEl) return;
        writeStreamedMarkdown(
            el as AparteMarkdownStreamHost,
            contentEl,
            segment.content,
            segment.isStreaming !== false,
        );
    },
    getStyles: () => ``
};
