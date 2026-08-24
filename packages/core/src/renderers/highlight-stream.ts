/**
 * Progressive syntax highlighting for a code pane that is STILL STREAMING.
 *
 * The previous shape — `codeEl.textContent = content` on every token, plus a
 * debounced full re-highlight — made the pane flicker between plain and coloured:
 * assigning `textContent` destroys the highlighter's `<span>`s, so each token
 * erased the colours the last debounce had painted, and the reader saw plain text
 * most of the time with a coloured frame every 400ms. The debounce was not the
 * problem; rewriting the whole block on every token was.
 *
 * So the pane is split at the last newline:
 *
 *   <pre><code>  …highlighted COMPLETE lines…  <span data-aparte-tail>partial line</span>
 *
 * A token only rewrites the tail, which costs one text assignment and leaves the
 * coloured prefix untouched. The prefix advances at most once per
 * `HIGHLIGHT_DEBOUNCE_MS`, and only when a new line has actually completed —
 * highlighting a half-written line is also what made the colours wrong as well as
 * flickering, because an unterminated string or brace re-tokenises everything
 * after it.
 *
 * `data-aparte-hl-len` on the pane is the boundary, and the DOM is deliberately
 * the source of truth for it rather than a module-level map: it makes the value
 * monotonic across a slow highlight that resolves out of order, and it cannot go
 * stale when the pane is rebuilt underneath us.
 */
import { contextConfig } from '../config/index.js';
import { escapeHtml } from '../utils/escape.js';

/** One highlight per pane per this window. Shiki costs 50-100ms per call. */
const HIGHLIGHT_DEBOUNCE_MS = 400;
/** Bound on the throttle bookkeeping, so a long session cannot grow it forever. */
const MAX_THROTTLE_ENTRIES = 256;

const _lastHighlightAt = new Map<string, number>();

/**
 * Record `id`'s last-seen time in a bounded, insertion-ordered map.
 *
 * Shared with the artifact's event-dispatch throttle, which is why it is generic
 * over the map rather than closing over one.
 */
export function markThrottle(map: Map<string, number>, id: string, at: number): void {
    map.delete(id);
    if (map.size >= MAX_THROTTLE_ENTRIES) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
    }
    map.set(id, at);
}

/** Where the coloured prefix ends. Absent or unparseable means "nothing coloured". */
function highlightedLen(pane: HTMLElement): number {
    const n = Number(pane.dataset.aparteHlLen);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Paint `content` into `paneSelector` while it streams.
 *
 * Call it on every token: the cheap half runs every time, the highlight is
 * throttled internally. The caller still runs one final, whole-content highlight
 * when the segment settles — this function deliberately never colours the last
 * line, so the settle pass is what completes it.
 */
export function streamHighlight(
    element: HTMLElement,
    paneSelector: string,
    content: string,
    lang: string,
    segId: string,
): void {
    const pane = element.querySelector<HTMLElement>(paneSelector);
    if (!pane) return;

    const tail = pane.querySelector<HTMLElement>('[data-aparte-tail]');
    const hlLen = highlightedLen(pane);

    // ── every token: move the tail, and nothing else ──────────────────────
    if (tail && hlLen <= content.length) {
        tail.textContent = content.slice(hlLen);
    } else {
        // No coloured prefix yet, or the pane was rebuilt under us (a settle
        // highlight replaces the whole thing). Plain text, and forget the
        // boundary — self-healing beats a reset call at three call sites.
        delete pane.dataset.aparteHlLen;
        const codeEl = pane.querySelector('code');
        if (codeEl) codeEl.textContent = content;
        else pane.innerHTML = `<pre><code class="language-${escapeHtml(lang || 'text')}">${escapeHtml(content)}</code></pre>`;
    }

    // ── throttled: advance the coloured prefix by whole lines ─────────────
    const cut = content.lastIndexOf('\n') + 1;
    if (cut <= hlLen) return;
    const now = Date.now();
    if (now - (_lastHighlightAt.get(segId) ?? 0) < HIGHLIGHT_DEBOUNCE_MS) return;
    markThrottle(_lastHighlightAt, segId, now);

    // Resolved from the element, not the ambient config: this lands late, and by
    // then the render-time config is gone.
    void contextConfig(element).highlightCode(content.slice(0, cut), lang).then(html => {
        const live = element.querySelector<HTMLElement>(paneSelector);
        if (!live) return;
        // Monotonic. Two highlights can be in flight; the older one carries the
        // SHORTER prefix, and letting it land would visibly rewind the pane.
        if (cut <= highlightedLen(live)) return;
        live.innerHTML = html;
        const codeEl = live.querySelector('code') ?? live;
        const span = document.createElement('span');
        span.dataset.aparteTail = '';
        // The captured tail may already be one token behind; the next token fixes
        // it, and there is always a next one or a settle pass.
        span.textContent = content.slice(cut);
        codeEl.appendChild(span);
        live.dataset.aparteHlLen = String(cut);
    }).catch(() => { /* best-effort: a failed highlight degrades silently */ });
}
