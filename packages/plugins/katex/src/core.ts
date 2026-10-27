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
     * When a formula still arriving was last drawn, and how long that took. One for all:
     * only the formula a reply is writing is open, and the next drawing waits a frame,
     * or as long as the last one took if that was longer (a matrix is slow).
     */
    const pace = { at: -Infinity, took: 0 };

    const ensure = (): KatexLike | Promise<KatexLike> => {
        if (katex) return katex;
        const got = load();
        if (!(got instanceof Promise)) return (katex = got);
        // Not poisoned: a failed load is tried again on the next formula.
        loading ??= got.then((k) => (katex = k), (error: unknown) => { loading = undefined; throw error; });
        return loading;
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
                // Not waited for: a formula still arriving is drawn again on its next token.
                const loaded = ensure();
                if (loaded instanceof Promise) { void loaded.catch(() => { /* retried on the next formula */ }); return null; }
                const now = performance.now();
                if (now - pace.at < Math.max(FRAME_MS, pace.took)) return null;
                const html = draw(loaded, ctx);
                pace.at = now;
                pace.took = performance.now() - now;
                return html;
            }
            const k = ensure();
            return k instanceof Promise ? k.then((loaded) => draw(loaded, ctx)) : draw(k, ctx);
        },
    };
}

function failed(tex: string, message: string): string {
    return `<code class="aparte-code-error" title="${escapeHtml(message)}">${escapeHtml(tex)}</code>`;
}
