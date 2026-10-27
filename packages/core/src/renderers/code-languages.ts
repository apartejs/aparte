/**
 * Drawing the source of a language — maths, a diagram — beside the placeholder a
 * Markdown provider or a code segment left for it.
 *
 * The meeting point between two kinds of plugin that must not know each other: a
 * Markdown provider (marked, streaming-markdown, the consumer's own) marks a source
 * with `<code class="language-X">` — inside a `<pre>` for a block, `math-display` /
 * `math-inline` for maths — and a renderer registered for X draws it. Core matches the
 * two.
 *
 * The placeholder is never touched. An incremental provider keeps writing tokens INTO
 * it while the source streams, and a drawing put there would mix with the text that
 * arrives next. So it is hidden, and the drawing goes in a sibling `<span>`: inside the
 * same `<pre>` for a block, right after the `<code>` inline — never at the top level of
 * the rendered Markdown, whose nodes a provider may track and replace.
 *
 * Whether a source is still arriving comes from the caller (`streaming`), not from an
 * attribute alone: once settled, everything is closed — a reply cut off inside a formula
 * still gets its final drawing, and an `open` marker the model wrote itself does
 * nothing. While streaming, a source is open if its provider marked it
 * `data-aparte-open`, or if it is the last placeholder, which covers a provider that
 * marks nothing.
 *
 * Two things keep a drawing from flickering while the DOM under it is rebuilt — the
 * one-shot path rewrites every placeholder on every token, an incremental one replaces
 * its last block:
 *
 * - a closed source's markup is cached by renderer and key, so a new placeholder for the
 *   same source is drawn synchronously; and within one root, the nodes drawn last time
 *   are moved across rather than built again (a diagram's `<img>` is not decoded again)
 *   when the placeholder that held them has left the document;
 * - an open source keeps the last drawing made for its POSITION — language, block or
 *   inline, and rank among those — as long as the source still extends the one drawn:
 *   a streamed source only grows at its end, so a source that does not start with the
 *   drawn one is another formula, and shows as text until it is drawn.
 *
 * An answer that arrives later runs the engine again on its root — once per root per
 * microtask, however many answers land together.
 */
import { contextConfig } from '../config/index.js';
import type {
    AparteConfig,
    AparteCodeLanguageContext,
    AparteCodeLanguageRenderer,
} from '../config/aparte-config.js';

const DRAWING_CLASS = 'aparte-code-drawing';
const PENDING_CLASS = 'aparte-code-pending';
const OPEN_ATTR = 'data-aparte-open';
const DRAWN_ATTR = 'data-aparte-drawn';
/** Cache budget per renderer, in UTF-16 code units: a diagram's data URL weighs tens of kB. */
const CACHE_BUDGET = 4 * 1024 * 1024;

export interface AparteRenderCodeLanguagesOptions {
    /** The content is still streaming: its last source, and any marked open, are still arriving. */
    streaming?: boolean;
    /**
     * Only redraw what is drawn already, where what it depends on moved (a renderer's
     * `cacheKey`, a theme). For a renderer reacting to its own change, over a whole page.
     */
    refresh?: boolean;
    /** Only this language. */
    language?: string;
}

/**
 * A drawing's markup. Only markup: the module-level cache outlives every chat, and a
 * node kept there would keep the removed chat it was drawn in.
 */
interface Drawn {
    html: string | null;
}

interface HostState {
    renderer: AparteCodeLanguageRenderer;
    /** The cache key drawn, or `null` for an open source's provisional drawing. */
    key: string | null;
    drawing: HTMLElement;
    entry: Drawn;
    ctx: AparteCodeLanguageContext;
}

/** A byte-bounded LRU: entries are touched on read, the oldest go first. */
class DrawingCache {
    private readonly entries = new Map<string, Drawn>();
    private size = 0;
    get(key: string): Drawn | undefined {
        const hit = this.entries.get(key);
        if (hit) { this.entries.delete(key); this.entries.set(key, hit); }
        return hit;
    }
    set(key: string, html: string | null): Drawn {
        const old = this.entries.get(key);
        if (old) { this.size -= weight(key, old); this.entries.delete(key); }
        const entry: Drawn = { html };
        this.entries.set(key, entry);
        this.size += weight(key, entry);
        for (const [k, v] of this.entries) {
            if (this.size <= CACHE_BUDGET || k === key) break;
            this.entries.delete(k);
            this.size -= weight(k, v);
        }
        return entry;
    }
}
const weight = (key: string, entry: Drawn): number => key.length + (entry.html?.length ?? 0);

const hosts = new WeakMap<HTMLElement, HostState>();
const drawingOwner = new WeakMap<HTMLElement, HTMLElement>();
const caches = new WeakMap<AparteCodeLanguageRenderer, DrawingCache>();
const inflight = new WeakMap<AparteCodeLanguageRenderer, Map<string, Promise<string | null>>>();
/** Per root: the nodes each drawing was last built into, to move rather than rebuild. */
const builtNodes = new WeakMap<Element, WeakMap<Drawn, { nodes: Node[]; owner: HTMLElement }>>();
/** Per root: the last drawing for each open position, and the source being asked of it. */
const lastGood = new WeakMap<Element, Map<string, Drawn & { source: string }>>();
const asked = new WeakMap<Element, Map<string, string>>();
const lastOptions = new WeakMap<Element, AparteRenderCodeLanguagesOptions>();
const warned = new WeakSet<AparteCodeLanguageRenderer>();
/** Lazy renderers: boxes that came near the screen once, and the root each one waits in. */
const seen = new WeakSet<Element>();
const waitingRoot = new WeakMap<Element, Element>();
/**
 * One observer per scroll container — weakly, so a removed chat takes its observer with
 * it — and one for the page, per `IntersectionObserver` constructor in place.
 */
const observers = new WeakMap<typeof IntersectionObserver, { page?: IntersectionObserver; byScroller: WeakMap<Element, IntersectionObserver> }>();
const observed = new WeakMap<IntersectionObserver, number>();

function cacheOf(renderer: AparteCodeLanguageRenderer): DrawingCache {
    let cache = caches.get(renderer);
    if (!cache) { cache = new DrawingCache(); caches.set(renderer, cache); }
    return cache;
}

function inflightOf(renderer: AparteCodeLanguageRenderer): Map<string, Promise<string | null>> {
    let map = inflight.get(renderer);
    if (!map) { map = new Map(); inflight.set(renderer, map); }
    return map;
}

function mapOf<V>(store: WeakMap<Element, Map<string, V>>, root: Element): Map<string, V> {
    let map = store.get(root);
    if (!map) { map = new Map(); store.set(root, map); }
    return map;
}

function warnOnce(renderer: AparteCodeLanguageRenderer, error: unknown): void {
    if (warned.has(renderer)) return;
    warned.add(renderer);
    console.warn(`[aparte] The ${renderer.languages.join('/')} renderer failed; the source is shown instead.`, error);
}

/** `language-ts` → `ts`; the first such class, lower-cased. */
function languageOf(code: Element): string | null {
    for (const name of Array.from(code.classList)) {
        if (name.startsWith('language-')) return name.slice('language-'.length).toLowerCase() || null;
    }
    return null;
}

function isDisplay(code: Element): boolean {
    if (code.classList.contains('math-display')) return true;
    if (code.classList.contains('math-inline')) return false;
    return code.parentElement?.tagName === 'PRE';
}

function isMarkedOpen(code: Element): boolean {
    return code.hasAttribute(OPEN_ATTR) || (code.parentElement?.tagName === 'PRE' && code.parentElement.hasAttribute(OPEN_ATTR));
}

function keyOf(renderer: AparteCodeLanguageRenderer, ctx: AparteCodeLanguageContext): string {
    let extra = '';
    try { extra = renderer.cacheKey?.(ctx) ?? ''; } catch (error) { warnOnce(renderer, error); }
    return `${ctx.language}\u0001${ctx.display ? 'd' : 'i'}\u0001${extra}\u0001${ctx.source}`;
}

function isThenable(value: unknown): value is Promise<string | null> {
    return typeof (value as { then?: unknown } | null)?.then === 'function';
}

/** The box the reader sees for a placeholder: its `<pre>`, or its drawing, or itself. */
function boxOf(code: HTMLElement): Element {
    return code.closest('pre') ?? hosts.get(code)?.drawing ?? code;
}

/** What grows when a placeholder is drawn: its `<pre>`, or the line of text it sits in. */
function grownBoxOf(code: HTMLElement): Element {
    return code.closest('pre') ?? code.parentElement ?? code;
}

// ── Running again, once per root per tick ─────────────────────────────────────

const plainRuns = new Set<Element>();
const refreshRuns = new Map<Element, AparteRenderCodeLanguagesOptions>();
let flushing = false;

/**
 * Run the engine on `root` again soon: after a drawing arrived, or a placeholder came
 * near the screen. Coalesced, so N answers landing together cost one pass, not N — and
 * a pass cannot multiply them, since it queues nothing for a root already queued.
 */
function schedule(root: Element, refresh?: AparteRenderCodeLanguagesOptions): void {
    if (refresh) refreshRuns.set(root, refresh);
    else plainRuns.add(root);
    if (flushing) return;
    flushing = true;
    queueMicrotask(() => {
        flushing = false;
        const plain = [...plainRuns];
        const refreshes = [...refreshRuns];
        plainRuns.clear();
        refreshRuns.clear();
        for (const root of plain) rerun(root);
        for (const [root, options] of refreshes) if (root.isConnected) renderCodeLanguages(root, options);
    });
}

/**
 * Queue one run of `root` when `promise` resolves: once per root, however many passes see
 * it still running. A plain run wins over a refresh of the same root: it does more.
 */
const waiters = new WeakMap<Promise<unknown>, Map<Element, AparteRenderCodeLanguagesOptions | undefined>>();
function whenSettled(promise: Promise<unknown>, root: Element, refresh?: AparteRenderCodeLanguagesOptions): void {
    let roots = waiters.get(promise);
    if (!roots) {
        const waiting = new Map<Element, AparteRenderCodeLanguagesOptions | undefined>();
        waiters.set(promise, waiting);
        roots = waiting;
        void promise.then(
            () => { for (const [r, options] of waiting) schedule(r, options); waiting.clear(); },
            () => waiting.clear(),
        );
    }
    if (!roots.has(root) || refresh === undefined) roots.set(root, refresh);
}

/** The scroll container a run is compensating, and where the reader's view starts in it. */
let compensating: { scroller: HTMLElement | null; top: number } | null = null;

function scrollerOf(el: Element): HTMLElement | null {
    for (let node = el.parentElement; node; node = node.parentElement) {
        const overflow = getComputedStyle(node).overflowY;
        if (overflow === 'auto' || overflow === 'scroll') return node;
    }
    return null;
}

/**
 * Run the engine on `root` again with the options it last ran with. A drawing that grows
 * a box wholly above what the reader sees is compensated, box by box (see `fill`), so the
 * text they are reading does not move: the transcript turns the browser's own scroll
 * anchoring off.
 */
function rerun(root: Element): void {
    if (!root.isConnected) return;
    const scroller = scrollerOf(root);
    const view = scroller ? scroller.getBoundingClientRect().top + (parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0) : 0;
    compensating = { scroller, top: view };
    try {
        renderCodeLanguages(root, lastOptions.get(root) ?? {});
    } finally {
        compensating = null;
    }
}

/**
 * Hold a lazy renderer's placeholder until its box comes within a screen of what the
 * reader sees. True when it is held; false when it may be drawn now.
 */
function deferred(code: HTMLElement, root: Element): boolean {
    const target = boxOf(code);
    if (seen.has(target) || typeof IntersectionObserver === 'undefined') return false;
    const scroller = scrollerOf(target);
    let set = observers.get(IntersectionObserver);
    if (!set) { set = { byScroller: new WeakMap() }; observers.set(IntersectionObserver, set); }
    let observer = scroller ? set.byScroller.get(scroller) : set.page;
    if (!observer) {
        const made: IntersectionObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                const box = entry.target;
                if (box.isConnected && !entry.isIntersecting) continue;
                made.unobserve(box);
                const left = (observed.get(made) ?? 1) - 1;
                observed.set(made, left);
                if (left <= 0) {
                    made.disconnect();
                    if (scroller) set!.byScroller.delete(scroller);
                    else if (set!.page === made) set!.page = undefined;
                }
                if (!box.isConnected) continue;
                seen.add(box);
                const waiting = waitingRoot.get(box);
                if (waiting) schedule(waiting);
            }
        }, { root: scroller, rootMargin: '100% 0px' });
        observer = made;
        if (scroller) set.byScroller.set(scroller, made);
        else set.page = made;
    }
    if (waitingRoot.get(target) !== root) {
        waitingRoot.set(target, root);
        observed.set(observer, (observed.get(observer) ?? 0) + 1);
        observer.observe(target);
    }
    return true;
}

// ── Drawing ───────────────────────────────────────────────────────────────────

/**
 * Show `entry` beside `code`. The nodes built for it in this root last time are moved
 * across when the placeholder that held them has left the document and this one is in
 * it — the case of a block rebuilt under the same root — and built again otherwise, so
 * a drawing in a tree that is only detached for a moment is never emptied.
 */
function fill(root: Element, code: HTMLElement, entry: Drawn, renderer: AparteCodeLanguageRenderer, ctx: AparteCodeLanguageContext, key: string | null): void {
    if (entry.html === null) { showSource(code, ctx.open); return; }
    const box = compensating ? grownBoxOf(code) : null;
    const before = box ? box.getBoundingClientRect() : null;

    const state = hosts.get(code);
    let drawing = state?.drawing;
    if (!drawing) {
        drawing = document.createElement('span');
        drawing.className = DRAWING_CLASS;
        if (ctx.display) drawing.setAttribute('data-aparte-display', '');
        code.after(drawing);
        drawingOwner.set(drawing, code);
        if (code.parentElement?.tagName === 'PRE') code.parentElement.setAttribute(DRAWN_ATTR, '');
    }
    if (state?.entry !== entry || drawing.childNodes.length === 0) {
        let built = builtNodes.get(root);
        if (!built) { built = new WeakMap(); builtNodes.set(root, built); }
        const last = built.get(entry);
        const movable = last && last.owner !== code && !last.owner.isConnected && code.isConnected
            && last.nodes.length > 0 && !last.nodes[0]!.isConnected;
        if (movable) {
            // The placeholder they came from is gone from the page: it drew them, it no
            // longer shows them, and if it ever comes back it draws again.
            hosts.delete(last.owner);
            drawing.replaceChildren(...last.nodes);
        } else {
            drawing.innerHTML = entry.html;
            try { renderer.relabel?.(drawing, ctx); } catch (error) { warnOnce(renderer, error); }
        }
        built.set(entry, { nodes: Array.from(drawing.childNodes), owner: code });
    }
    code.hidden = true;
    code.style.setProperty('display', 'none');
    code.classList.remove(PENDING_CLASS);
    hosts.set(code, { renderer, key, drawing, entry, ctx });

    if (box && before && compensating) {
        // Growth only: the viewport reads a scroll position going DOWN that it did not
        // write as the reader leaving the bottom.
        const delta = box.getBoundingClientRect().height - before.height;
        if (delta > 0 && before.bottom <= compensating.top) {
            if (compensating.scroller) compensating.scroller.scrollTop += delta;
            else window.scrollBy(0, delta);
        }
    }
}

/** Back to the source: no drawing beside it, and muted while it is still arriving. */
function showSource(code: HTMLElement, pending: boolean): void {
    const state = hosts.get(code);
    if (state) {
        state.drawing.remove();
        hosts.delete(code);
    }
    if (code.parentElement?.tagName === 'PRE') code.parentElement.removeAttribute(DRAWN_ATTR);
    code.hidden = false;
    code.style.removeProperty('display');
    code.classList.toggle(PENDING_CLASS, pending);
}

function drawClosed(root: Element, code: HTMLElement, renderer: AparteCodeLanguageRenderer, ctx: AparteCodeLanguageContext, pos: string, refresh: AparteRenderCodeLanguagesOptions | undefined): void {
    const key = keyOf(renderer, ctx);
    let state = hosts.get(code);
    if (state && state.renderer === renderer && state.key === key && state.drawing.childNodes.length > 0) return;
    const cache = cacheOf(renderer);
    const hit = cache.get(key);
    if (hit) { fill(root, code, hit, renderer, ctx, key); return; }

    // Until it is drawn: what is shown stays (a refresh), or the last drawing made for
    // this position while it streamed, if this source extends it.
    if (!state && !refresh) {
        const provisional = lastGood.get(root)?.get(pos);
        if (provisional && ctx.source.startsWith(provisional.source)) fill(root, code, provisional, renderer, ctx, null);
        state = hosts.get(code);
    }
    // Held until near the screen only when nothing is drawn yet: a reopened conversation.
    // A source drawn already — while it streamed, or before a refresh — is on screen, and
    // its final drawing must not wait for an observer that only reports on rendered frames.
    if (renderer.lazy && !refresh && !state && deferred(code, root)) return;

    const pending = inflightOf(renderer);
    const running = pending.get(key);
    if (running) { whenSettled(running, root, refresh); return; }
    let result: string | null | Promise<string | null>;
    try { result = renderer.render(ctx); } catch (error) { warnOnce(renderer, error); result = null; }
    if (!isThenable(result)) { fill(root, code, cache.set(key, result ?? null), renderer, ctx, key); return; }
    const settled = result.then((html) => {
        pending.delete(key);
        cache.set(key, html ?? null);
        return html;
    }, (error: unknown) => {
        // Not cached: a failed load (offline, a chunk that did not arrive) is tried again
        // on the next pass — nothing runs one now, or a renderer failing every time would
        // be asked again forever.
        pending.delete(key);
        warnOnce(renderer, error);
        throw error;
    });
    pending.set(key, settled);
    void settled.then(() => schedule(root, refresh), () => { /* the source stays shown */ });
}

function drawOpen(root: Element, code: HTMLElement, renderer: AparteCodeLanguageRenderer, ctx: AparteCodeLanguageContext, pos: string): void {
    const good = mapOf(lastGood, root);
    const previous = good.get(pos);
    if (previous && ctx.source.startsWith(previous.source)) {
        if (hosts.get(code)?.entry !== previous) fill(root, code, previous, renderer, ctx, null);
    } else {
        showSource(code, true);
    }

    // Asked once per source while it is being drawn. An answer of `null` — not now — is
    // forgotten, so the next pass asks again: a renderer pacing itself, or still loading,
    // gets its source back on the next token instead of never.
    const requests = mapOf(asked, root);
    if (requests.get(pos) === ctx.source) return;
    requests.set(pos, ctx.source);
    const forget = (): void => { if (requests.get(pos) === ctx.source) requests.delete(pos); };

    const keep = (html: string | null | undefined): boolean => {
        if (html === null || html === undefined) return false;
        const current = good.get(pos);
        // A late answer for an older source must not replace a newer drawing.
        if (current && !ctx.source.startsWith(current.source)) return false;
        good.set(pos, { source: ctx.source, html });
        return true;
    };
    let result: string | null | Promise<string | null>;
    try { result = renderer.render(ctx); } catch { result = null; }   // a half-written source is expected to fail
    if (!isThenable(result)) {
        if (keep(result)) fill(root, code, good.get(pos)!, renderer, ctx, null);
        else forget();
        return;
    }
    result.then((html) => {
        if (keep(html)) schedule(root);
        else forget();
    }, forget);
}

/**
 * Draw every placeholder under `root` whose language has a renderer.
 *
 * Core calls it wherever it writes Markdown or a code block; call it yourself after
 * writing a provider's HTML into an element of your own (a custom segment renderer).
 * Idempotent and cheap when nothing changed, and a no-op where no renderer is registered.
 */
export function renderCodeLanguages(root: Element, options: AparteRenderCodeLanguagesOptions = {}): void {
    if (typeof document === 'undefined') return;
    const { streaming = false, refresh = false, language } = options;
    if (!refresh) {
        lastOptions.set(root, { streaming });
        if (!streaming) asked.delete(root);
        if (!contextConfig(root).hasCodeLanguageRenderer()) {
            if (root.querySelector(`.${DRAWING_CLASS}`)) unrenderCodeLanguages(root);
            return;
        }
    }

    const placeholders = Array.from(root.querySelectorAll<HTMLElement>('code[class*="language-"]'))
        .filter((code) => !code.closest(`.${DRAWING_CLASS}`));
    const ranks = new Map<string, number>();
    placeholders.forEach((code, index) => {
        const lang = languageOf(code);
        if (!lang || (language && lang !== language)) return;
        const cfg: AparteConfig = refresh ? contextConfig(code) : contextConfig(root);
        const renderer = cfg.getCodeLanguageRenderer(lang);
        const state = hosts.get(code);
        if (refresh && (!state || state.key === null)) return;
        if (!renderer) { if (state) showSource(code, false); return; }

        const display = isDisplay(code);
        const rankKey = `${lang}|${display ? 'd' : 'i'}`;
        const rank = ranks.get(rankKey) ?? 0;
        ranks.set(rankKey, rank + 1);
        const pos = `${rankKey}|${rank}`;

        const source = code.textContent ?? '';
        if (!source.trim()) { if (state) showSource(code, false); return; }
        const open = streaming && (isMarkedOpen(code) || index === placeholders.length - 1);
        const ctx: AparteCodeLanguageContext = { language: lang, source, display, open, host: code, config: cfg };
        if (open) drawOpen(root, code, renderer, ctx, pos);
        else drawClosed(root, code, renderer, ctx, pos, refresh ? options : undefined);
    });
}

/**
 * Take every drawing under `root` away and show the sources again — before something
 * re-serialises `root` through the sanitizer, which would strip what a drawing is made
 * of. Drawing again afterwards costs nothing: the drawings are cached.
 */
export function unrenderCodeLanguages(root: Element): void {
    for (const drawing of Array.from(root.querySelectorAll<HTMLElement>(`.${DRAWING_CLASS}`))) {
        const code = drawingOwner.get(drawing);
        if (code) showSource(code, false);
        else drawing.remove();
    }
}

/** Let each drawing under `root` re-read what it takes from the config: the locale changed. */
export function relabelCodeLanguages(root: Element): void {
    for (const drawing of Array.from(root.querySelectorAll<HTMLElement>(`.${DRAWING_CLASS}`))) {
        const code = drawingOwner.get(drawing);
        const state = code ? hosts.get(code) : undefined;
        if (!state) continue;
        try { state.renderer.relabel?.(drawing, state.ctx); } catch (error) { warnOnce(state.renderer, error); }
    }
}

/** Whether a code block in `language` is drawn by a registered renderer, so a highlighter should leave it. */
export function isDrawnLanguage(language: string, element?: Element | null): boolean {
    return !!language && contextConfig(element).hasCodeLanguageRenderer(language);
}
