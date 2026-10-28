import { aparteGlobalConfig, escapeHtml, type AparteConfig, type AparteCodeLanguageContext } from '@aparte/core';
import { checkStyles } from './stylesheet-check.js';

/**
 * The part of KaTeX this plugin calls. Structural, so this module imports nothing from
 * `katex` — not even a type — and a bundle that hands over its own instance carries no
 * second copy.
 */
export interface KatexLike {
    renderToString(tex: string, options?: Record<string, unknown>): string;
}

export interface KatexOptions {
    /**
     * Draw a formula while it arrives, keeping the last drawing that parsed until the
     * next one does (default `true`). `false` draws it once it has closed.
     */
    live?: boolean;
    /**
     * Options for KaTeX itself — `macros`, `leqno`, `fleqn`, `output`, `minRuleThickness`…
     * The plugin keeps the ones that make model-written TeX safe to draw: `trust` is
     * always `false`, `maxSize` and `maxExpand` are capped, and `macros` is copied for
     * each formula so a `\gdef` in one reply cannot reach the next.
     */
    katex?: Record<string, unknown>;
    /** The longest formula drawn, in characters (default 4000); a longer one shows as TeX. */
    maxLength?: number;
}

/** How long a frame is, for the live redraw's pace. */
const FRAME_MS = 16;
/**
 * The tallest line a formula may lay out, in em. KaTeX caps a size it is asked for
 * (`maxSize`) but not a negative shift: `\raisebox{-10000em}{x}` makes a line 10000em
 * tall, a bubble a few hundred thousand pixels high. A 30-row matrix is under 40em.
 */
const TALLEST_EM = 100;

/**
 * Draw maths with a KaTeX you provide — the instance, or a function that loads it on the
 * first formula. The entry point for a bundle that controls what it ships:
 * `@aparte/plugin-katex` itself is this, with `() => import('katex')`.
 *
 * KaTeX's stylesheet is yours to import (`katex/dist/katex.min.css`): its fonts are
 * relative URLs your bundler resolves. Without it each formula shows twice.
 *
 * @returns a disposer that unregisters the renderer.
 * @example
 * import katex from 'katex';
 * import 'katex/dist/katex.min.css';
 * import { setupKatexWith } from '@aparte/plugin-katex/core';
 * setupKatexWith(katex);
 */
export function setupKatexWith(
    katex: KatexLike | (() => Promise<KatexLike>),
    options: KatexOptions = {},
    config: AparteConfig = aparteGlobalConfig,
): () => void {
    const load = typeof katex === 'function' ? katex : () => katex;
    return config.registerCodeLanguageRenderer(createKatexRenderer(load, options));
}

/** The renderer, over a KaTeX that may not be loaded yet. */
function createKatexRenderer(
    load: () => KatexLike | Promise<KatexLike>,
    options: KatexOptions,
) {
    const live = options.live !== false;
    const maxLength = options.maxLength ?? 4000;
    const user = options.katex ?? {};
    let katex: KatexLike | undefined;
    let loading: Promise<KatexLike> | undefined;
    let checkedStyles = false;
    /**
     * The pace of a formula still arriving, per reply part: when it was last drawn, how
     * long that took, and the latest source waiting for the next turn. The next drawing
     * waits a frame, or as long as the last one took if that was longer (a matrix is
     * slow) — and then it IS drawn: a source asked for inside the wait is answered once
     * the wait is over, so the last token of a formula is never left undrawn.
     */
    interface Pace {
        at: number;
        took: number;
        waiting: { ctx: AparteCodeLanguageContext; answer: (html: string | null) => void } | null;
        timer: ReturnType<typeof setTimeout> | undefined;
    }
    const paces = new WeakMap<Element, Pace>();
    /**
     * The reply part a formula belongs to, which outlives a rebuilt block: its segment, or
     * the bubble's content when the reply has no segments — not the paragraph, which the
     * Markdown provider writes anew on every token.
     */
    const partOf = (host: HTMLElement): Element => host.closest('[data-segment-id], .aparte-content') ?? host.parentElement ?? host;

    const ensure = (): KatexLike | Promise<KatexLike> => {
        if (katex) return katex;
        if (loading) return loading;
        const got = load();
        if (!(got instanceof Promise)) return (katex = got);
        // Not poisoned: a failed load is tried again on the next formula.
        loading ??= got.then((k) => (katex = k), (error: unknown) => { loading = undefined; throw error; });
        return loading;
    };

    const drawPaced = (pace: Pace, k: KatexLike, ctx: AparteCodeLanguageContext): string | null => {
        const started = performance.now();
        const html = draw(k, ctx);
        pace.at = started;
        pace.took = performance.now() - started;
        return html;
    };

    const draw = (k: KatexLike, ctx: AparteCodeLanguageContext): string | null => {
        const tex = ctx.source.trim();
        if (tex.length > maxLength) return ctx.open ? null : failed(tex, 'This formula is too long to draw.');
        try {
            const html = k.renderToString(tex, {
                output: 'htmlAndMathml',
                strict: 'ignore',
                ...user,
                displayMode: ctx.display,
                throwOnError: true,
                trust: false,
                maxSize: Math.min(Number(user['maxSize'] ?? 10), 10),
                maxExpand: Math.min(Number(user['maxExpand'] ?? 500), 500),
                macros: { ...(user['macros'] as Record<string, string> | undefined) },
            });
            if (!checkedStyles) { checkedStyles = true; checkStyles(); }
            if (tallestLine(html) > TALLEST_EM) return ctx.open ? null : failed(tex, 'This formula is too tall to draw.');
            return html;
        } catch (error) {
            // Half a formula does not parse; the last drawing stays until the next one does.
            return ctx.open ? null : failed(tex, error instanceof Error ? error.message : String(error));
        }
    };

    return {
        languages: ['math'] as const,
        render(ctx: AparteCodeLanguageContext): string | null | Promise<string | null> {
            if (ctx.open) {
                if (!live) return null;
                const loaded = ensure();
                // Still loading: answered once KaTeX is there, not left as TeX until a later token.
                if (loaded instanceof Promise) return loaded.then((k) => draw(k, ctx), () => null);
                const part = partOf(ctx.host);
                let pace = paces.get(part);
                if (!pace) { pace = { at: -Infinity, took: 0, waiting: null, timer: undefined }; paces.set(part, pace); }
                const wait = pace.at + Math.max(FRAME_MS, pace.took) - performance.now();
                if (wait <= 0 && !pace.waiting) return drawPaced(pace, loaded, ctx);
                // Inside the wait: the latest source takes the next turn, the one it replaces
                // is answered null (the engine asks again for anything still current).
                const current = pace;
                pace.waiting?.answer(null);
                return new Promise<string | null>((answer) => {
                    current.waiting = { ctx, answer };
                    current.timer ??= setTimeout(() => {
                        current.timer = undefined;
                        const job = current.waiting;
                        current.waiting = null;
                        if (job) job.answer(drawPaced(current, loaded, job.ctx));
                    }, Math.max(0, wait));
                });
            }
            const k = ensure();
            return k instanceof Promise ? k.then((loaded) => draw(loaded, ctx)) : draw(k, ctx);
        },
    };
}

/** The height of the tallest line KaTeX laid a formula out on: each line's strut, in em. */
function tallestLine(html: string): number {
    let tallest = 0;
    for (const match of html.matchAll(/strut" style="height:([\d.]+)em/g)) tallest = Math.max(tallest, Number(match[1]));
    return tallest;
}

function failed(tex: string, message: string): string {
    return `<code class="aparte-code-error" title="${escapeHtml(message)}">${escapeHtml(tex)}</code>`;
}
