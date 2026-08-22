/**
 * Plain text — the streaming path, and the only renderer that owns a DOM host contract.
 *
 * One renderer, one file. They lived in a single 1900-line module because there was
 * nowhere else to put them; the registry that consumes them is in
 * `../segment-renderers.ts`.
 */
import { escapeHtml } from '../../utils/escape.js';
import { contextConfig } from '../../config/index.js';
import type { AparteStreamingMarkdownRenderer } from '../../config/index.js';
import type {
    AparteSegmentRenderer,
    AparteTextSegment,
} from '../../types/index.js';

/**
 * Text segment renderer.
 *
 * During streaming, if an incremental Markdown provider is registered
 * (`@aparte/provider-streaming-markdown`), each new chunk is fed to a persistent
 * incremental parser that *appends* DOM nodes — O(n) over the whole message,
 * with no per-token re-parse or `innerHTML` rebuild (that per-token render +
 * GPU paint storm is what starves the model's WebGPU decode). It also renders
 * partial Markdown live — `**bold` shows bold before the closing `**` arrives.
 *
 * A NON-streaming update (`isStreaming === false`) flushes the parser with
 * `end()` — which emits its buffered token-lookahead tail, e.g. a trailing
 * emoji — and re-renders once with the one-shot `renderMarkdown` for full
 * fidelity. `populateBubbleFromMessage` stamps `isStreaming: false` on the
 * segments of a settled message so a load / re-sync takes this safe path.
 */
type TextStreamHost = HTMLElement & {
    /**
     * Incremental-render state for this segment element:
     *   `undefined` → not started · `null` → no provider (one-shot fallback)
     *   object      → active incremental renderer + chars already written.
     */
    _aparteSmd?: { renderer: AparteStreamingMarkdownRenderer; written: number } | null;
};

export const textRenderer: AparteSegmentRenderer<AparteTextSegment> = {
    type: 'text',
    render: (segment) => `<div class="segment segment-text" data-segment-id="${escapeHtml(segment.id)}"><div class="segment-content">${contextConfig().renderMarkdown(segment.content)}</div></div>`,
    update: (el, segment) => {
        const contentEl = el.querySelector('.segment-content');
        if (!contentEl) return;
        const host = el as TextStreamHost;
        const streaming = segment.isStreaming !== false;

        if (streaming) {
            // Lazily create an incremental renderer on the first streaming update.
            if (host._aparteSmd === undefined) {
                const renderer = contextConfig().createStreamingMarkdownRenderer(contentEl as HTMLElement);
                if (renderer) {
                    contentEl.textContent = '';   // drop the skeleton — smd appends from scratch
                    host._aparteSmd = { renderer, written: 0 };
                } else {
                    host._aparteSmd = null;         // no provider → one-shot fallback below
                }
            }
            const smd = host._aparteSmd;
            if (smd) {
                const delta = segment.content.slice(smd.written);
                if (delta) {
                    smd.renderer.write(delta);
                    smd.written = segment.content.length;
                }
                return;
            }
            // smd === null → fall through to the one-shot render.
        } else if (host._aparteSmd) {
            // Stream finished — flush the incremental parser (emits its buffered
            // trailing characters), then re-render once below with the one-shot
            // provider for full Markdown fidelity.
            host._aparteSmd.renderer.end();
            host._aparteSmd = undefined;
        }

        contentEl.innerHTML = contextConfig().renderMarkdown(segment.content);
    },
    getStyles: () => ``
};
