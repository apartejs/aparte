/**
 * Writing streamed Markdown into an element — the incremental path, and its
 * one-shot fallback.
 *
 * Extracted from the text renderer when the thinking renderer needed the same
 * thing. It is a small state machine with three states and two failure modes that
 * only show up on a long stream, so the alternative was two hand-maintained copies
 * of it — and this repo has already paid for one of those (the `<artifact>` XML
 * feeder, whose two copies drifted and then cited each other by line number).
 *
 * What it does, and why:
 *
 * - With an incremental provider registered (`@aparte/plugin-streaming-markdown`),
 *   each new chunk is fed to a persistent parser that APPENDS DOM nodes — O(n) over
 *   the whole message, no per-token re-parse and no `innerHTML` rebuild. That
 *   rebuild is not merely wasteful: the per-token render plus GPU paint storm is
 *   what starves a local model's WebGPU decode. It also renders partial Markdown
 *   live, so `**bold` shows bold before its closing `**` arrives.
 * - With no provider, it falls back to the one-shot `renderMarkdown` — which is
 *   also what the zero-dependency default gives you (escape + `<br>`).
 * - On the settling update (`isStreaming === false`) it flushes the incremental
 *   parser with `end()` — that emits the buffered token lookahead, e.g. a trailing
 *   emoji — and then re-renders once through `renderMarkdown` for full fidelity:
 *   the one-shot provider when one is registered, else the incremental provider run
 *   over the complete string, so the streaming plugin installed alone settles on its
 *   own output. When `renderMarkdown` can only answer with core's escape-and-`<br>`
 *   default (the incremental provider failed on the whole string), re-rendering
 *   would write the raw source over rendered DOM at the moment the turn ends; the
 *   flushed DOM is kept and re-sanitised in place instead — and a later settle on
 *   the same content (a framework re-syncing the finished message) leaves it there.
 */
import { contextConfig } from '../config/index.js';
import type { AparteStreamingMarkdownRenderer } from '../config/index.js';
import { escapeHtml } from '../utils/escape.js';

/**
 * The element that carries the incremental state.
 *
 * It lives on the segment's root element rather than in a module map so that
 * removing the element removes the state with it — a map would keep a detached
 * parser alive for every message ever streamed.
 *
 *   `undefined` → not started · `null` → no provider (one-shot fallback)
 *   object      → active incremental renderer + chars already written.
 */
export type AparteMarkdownStreamHost = HTMLElement & {
    _aparteSmd?: { renderer: AparteStreamingMarkdownRenderer; written: number } | null;
};

/**
 * The content an element was last settled on by keeping the parser's DOM.
 *
 * The parser is gone once it settles, but the settle is not the last non-streaming
 * update an element receives: a framework's reconcile re-sends `{ content,
 * isStreaming: false }` to the last message on every render. Without this, that
 * second settle found no parser and fell through to the one-shot default, turning
 * the kept DOM back into its raw source one render after the turn ended.
 *
 * Keyed by the content element, because that is what the entry describes — the
 * bubble's own content element can be rebuilt under the same host — and weakly, so
 * that removing the element removes the entry, for the reason given above.
 */
const settledFromParser = new WeakMap<Element, string>();

/** A probe with HTML in it, because escaping HTML is what the default renderer does. */
const ONE_SHOT_PROBE = '<i>a</i>';

/**
 * Does `renderMarkdown` render Markdown here, or answer with core's zero-dependency
 * default? A registered one-shot provider renders, and so does the incremental provider
 * run over the whole string; the default is what is left when neither can.
 *
 * Asked of the seam itself, because `renderMarkdown` is the only public shape the
 * one-shot side has, and it is also what would run here. The default escapes HTML
 * and nothing else, so it hands the probe back as `escapeHtml` wrote it; a
 * registered provider answers differently even when it renders no Markdown at all
 * (a pass-through one returns the markup, which the sanitizer then keeps). Reusing
 * `escapeHtml` rather than re-typing the escaped string keeps the two sides of the
 * comparison reading the same source.
 */
function hasOneShotMarkdownProvider(): boolean {
    return contextConfig().renderMarkdown(ONE_SHOT_PROBE) !== escapeHtml(ONE_SHOT_PROBE);
}

/**
 * Render `content` into `contentEl`, incrementally while streaming.
 *
 * @param host      the segment's root element, which holds the parser state
 * @param contentEl the element whose children are the rendered Markdown
 * @param content   the FULL content so far, not the delta — the delta is derived
 * @param streaming false on the settling update, which flushes and re-renders once
 */
export function writeStreamedMarkdown(
    host: AparteMarkdownStreamHost,
    contentEl: Element,
    content: string,
    streaming: boolean,
): void {
    if (streaming) {
        // Lazily create an incremental renderer on the first streaming update.
        if (host._aparteSmd === undefined) {
            settledFromParser.delete(contentEl);   // a new stream writes over the settled DOM
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
            const delta = content.slice(smd.written);
            if (delta) {
                smd.renderer.write(delta);
                smd.written = content.length;
            }
            return;
        }
        // smd === null → fall through to the one-shot render.
    } else if (host._aparteSmd) {
        // Stream finished — feed whatever the last streaming update did not carry
        // (a completion whose call brings the final content), then flush the
        // incremental parser: `end()` emits its buffered trailing characters.
        const smd = host._aparteSmd;
        const tail = content.slice(smd.written);
        if (tail) {
            smd.renderer.write(tail);
            smd.written = content.length;
        }
        smd.renderer.end();
        host._aparteSmd = undefined;
        if (!hasOneShotMarkdownProvider()) {
            // `renderMarkdown` can only escape here (the incremental provider failed on
            // the complete string), so the render below would write the raw source over
            // rendered DOM. Keep what the parser wrote — through the sanitizer, which is
            // what makes writing DOM directly acceptable in the first place.
            contentEl.innerHTML = contextConfig().sanitizeHtml(contentEl.innerHTML);
            settledFromParser.set(contentEl, content);
            return;
        }
        // Otherwise fall through: the one-shot provider re-renders for full fidelity.
    } else if (settledFromParser.get(contentEl) === content && !hasOneShotMarkdownProvider()) {
        // Settled already, on this very content: what the parser wrote is still the
        // best render available. Changed content, or a one-shot provider registered
        // since, falls through — the kept DOM would be stale or second-best.
        return;
    }

    settledFromParser.delete(contentEl);
    contentEl.innerHTML = contextConfig().renderMarkdown(content);
}

/**
 * Highlight the fenced code blocks a Markdown render produced.
 *
 * The `code` SEGMENT renderer is the only thing in the library that calls
 * `highlightCode()`, so a fence that arrives inside another segment's Markdown —
 * a reasoning block, say — came out as a bare `<pre><code>` while the same fence
 * in the answer was highlighted. This closes that gap without touching the parser:
 * no nested segments, no segment tree, just the same provider applied to the
 * markup Markdown already produced.
 *
 * Best-effort and idempotent: a marked block is skipped on a re-render, a missing
 * provider leaves the plain block alone, and a failed highlight degrades silently
 * — exactly like the code renderer's own call.
 */
export function highlightMarkdownFences(contentEl: Element): void {
    const blocks = contentEl.querySelectorAll('pre > code:not([data-aparte-highlighted])');
    for (const block of blocks) {
        const pre = block.parentElement;
        if (!pre) continue;
        // `language-ts` is what every Markdown renderer emits for ```ts.
        const lang = Array.from(block.classList)
            .find(c => c.startsWith('language-'))?.slice('language-'.length) ?? '';
        const source = block.textContent ?? '';
        block.setAttribute('data-aparte-highlighted', '');
        void contextConfig().highlightCode(source, lang)
            .then(html => {
                // The provider returns a full `<pre>…</pre>`, so it replaces the
                // block's own `<pre>` rather than filling it.
                if (pre.isConnected || pre.parentElement) pre.outerHTML = html;
            })
            .catch(() => { /* best-effort: a failed highlight degrades silently */ });
    }
}
