import { aparteGlobalConfig, type AparteConfig } from '@aparte/core';
import { setupKatexWith, type KatexLike, type KatexOptions } from './core.js';

export { setupKatexWith } from './core.js';
export type { KatexLike, KatexOptions } from './core.js';

/**
 * Draw maths with [KaTeX](https://katex.org): `$…$`, `$$…$$`, `\(…\)` and `\[…\]` in a
 * reply, as a Markdown provider that recognises maths hands them over
 * (`@aparte/plugin-marked`, `@aparte/plugin-streaming-markdown`). A formula is drawn
 * while it arrives; one KaTeX cannot parse yet keeps the last drawing that it could.
 *
 * KaTeX is loaded on the first formula, not before. Its stylesheet is yours to import,
 * because its fonts are relative URLs your bundler resolves:
 *
 * ```ts
 * import 'katex/dist/katex.min.css';
 * ```
 *
 * @returns a disposer that unregisters the renderer.
 * @example
 * import 'katex/dist/katex.min.css';
 * import { setupKatex } from '@aparte/plugin-katex';
 * setupKatex();
 */
export function setupKatex(options: KatexOptions = {}, config: AparteConfig = aparteGlobalConfig): () => void {
    return setupKatexWith(
        () => import('katex').then((m) => (m.default ?? m) as unknown as KatexLike),
        options,
        config,
    );
}
