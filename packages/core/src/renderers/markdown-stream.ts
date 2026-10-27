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
import { renderingVersionOf } from '../config/aparte-config.js';
import type { AparteStreamingMarkdownRenderer } from '../config/index.js';
import { escapeHtml } from '../utils/escape.js';
import { renderCodeLanguages, unrenderCodeLanguages, isDrawnLanguage } from './code-languages.js';

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
 * What an element was last settled on, and who wrote it.
 *
 * The settle is not the last non-streaming update an element receives: a framework's
 * reconcile re-sends `{ content, isStreaming: false }` to the last message on every
 * render. Two things went wrong without this record:
 *
 * - `parser` — the DOM was kept from the incremental parser, and the parser is gone.
 *   The second settle found no parser and fell through to the one-shot default,
 *   turning the kept DOM back into its raw source one render after the turn ended.
 * - `markdown` — the one-shot render wrote it. Every re-sync rebuilt the whole
 *   element from the same string, which threw away what was drawn on top of it (a
 *   highlighted fence, a formula) only to draw it again.
 *
 * `config` and its rendering `version` at the time, so a provider or sanitizer changed
 * since still gets its redraw — and so does the same element drawn under another config,
 * whose count may well be the same number. Keyed by the content element, because that is
 * what the entry describes — the bubble's own content element can be rebuilt under the
 * same host — and weakly, so that removing the element removes the entry.
 */
const settled = new WeakMap<Element, { content: string; config: unknown; version: number; writer: 'parser' | 'markdown' }>();

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
 * Render `content` into `contentEl`, incrementally while streaming, then draw the code
 * languages a renderer is registered for — maths, a diagram — on every path out, so a
 * formula is drawn as soon as its provider has written it.
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
    writeMarkdown(host, contentEl, content, streaming);
    renderCodeLanguages(contentEl, { streaming });
}

function writeMarkdown(
    host: AparteMarkdownStreamHost,
    contentEl: Element,
    content: string,
    streaming: boolean,
): void {
    const cfg = contextConfig();
    if (streaming) {
        settled.delete(contentEl);   // a stream writes over whatever was settled here
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
            // what makes writing DOM directly acceptable in the first place. Drawings
            // come off first: the sanitizer would strip what they are made of, and
            // they are drawn again from the cache on the way out.
            unrenderCodeLanguages(contentEl);
            contentEl.innerHTML = cfg.sanitizeHtml(contentEl.innerHTML);
            settled.set(contentEl, { content, config: cfg, version: renderingVersionOf(cfg), writer: 'parser' });
            return;
        }
        // Otherwise fall through: the one-shot provider re-renders for full fidelity.
    } else {
        const last = settled.get(contentEl);
        if (last?.content === content) {
            // Settled already, on this very content. What the parser wrote is still the
            // best render available unless a one-shot provider has been registered since;
            // what the one-shot render wrote is still current unless a provider or the
            // sanitizer changed since. Changed content falls through either way.
            if (last.writer === 'parser' && !hasOneShotMarkdownProvider()) return;
            if (last.writer === 'markdown' && last.config === cfg && last.version === renderingVersionOf(cfg)) return;
        }
    }

    contentEl.innerHTML = cfg.renderMarkdown(content);
    if (streaming) settled.delete(contentEl);
    else settled.set(contentEl, { content, config: cfg, version: renderingVersionOf(cfg), writer: 'markdown' });
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
    // No highlighter: core's fallback is a bare `<pre><code>`, and put in the block's place it
    // would take the `language-*` class and whatever the Markdown renderer wrote on the `<pre>`.
    // Unmarked, so a highlighter set later still finds the block when the message is redrawn.
    if (!contextConfig().hasHighlightProvider()) return;
    const blocks = contentEl.querySelectorAll('pre > code:not([data-aparte-highlighted])');
    for (const block of blocks) {
        const pre = block.parentElement;
        if (!pre) continue;
        // `language-ts` is what every Markdown renderer emits for ```ts.
        const lang = Array.from(block.classList)
            .find(c => c.startsWith('language-'))?.slice('language-'.length) ?? '';
        // A language a renderer draws is not code to colour: the highlighter's whole-block
        // answer would replace the `<pre>`, and the drawing beside the source with it.
        if (isDrawnLanguage(lang, contentEl) || block.closest('.aparte-code-drawing')) continue;
        const source = block.textContent ?? '';
        block.setAttribute('data-aparte-highlighted', '');
        void contextConfig().highlightCode(source, lang, { fallback: false })
            .then(html => {
                // The provider returns a full `<pre>…</pre>`, so it replaces the
                // block's own `<pre>` rather than filling it.
                if (pre.isConnected || pre.parentElement) replaceHighlighted(pre, html);
            })
            // A failed highlight keeps the plain block, unmarked, so the next pass tries again.
            .catch(() => block.removeAttribute('data-aparte-highlighted'));
    }
}

/**
 * Put a highlighter's whole-block answer in place of `pre`, marked as highlighted.
 *
 * The mark is what tells the next pass to leave it: a highlighter's `<pre>` usually drops
 * the `language-*` class, so a block highlighted once and passed over again — a settled
 * reply a framework re-syncs, which keeps its DOM now — was highlighted a second time as
 * a language-less block, and lost its colours.
 */
export function replaceHighlighted(pre: Element, html: string): void {
    const template = document.createElement('template');
    template.innerHTML = html;
    for (const code of Array.from(template.content.querySelectorAll('code'))) code.setAttribute('data-aparte-highlighted', '');
    pre.replaceWith(template.content);
}
