import { aparteGlobalConfig, type AparteConfig } from '@aparte/core';
import { setupMermaidWith, type MermaidLike, type MermaidOptions } from './core.js';

export { setupMermaidWith } from './core.js';
export type { MermaidLike, MermaidOptions } from './core.js';

/**
 * Draw diagrams with [Mermaid](https://mermaid.js.org): every ```` ```mermaid ```` fence
 * in a reply, whichever Markdown provider is installed, or none. The diagram is redrawn
 * as its fence arrives and keeps the last version that parsed; once the fence closes,
 * one that does not parse shows a note and its source.
 *
 * Each diagram is an `<img>` of its SVG, so nothing in it — no script, no style a
 * model wrote — can reach the page; its colours come from the chat's theme and follow
 * it. Mermaid is loaded on the first diagram, and a diagram is drawn only once it
 * comes near the screen, so reopening a long conversation stays fast.
 *
 * @returns a disposer that unregisters the renderer.
 * @example
 * import { setupMermaid } from '@aparte/plugin-mermaid';
 * setupMermaid();
 */
export function setupMermaid(options: MermaidOptions = {}, config: AparteConfig = aparteGlobalConfig): () => void {
    return setupMermaidWith(
        () => import('mermaid').then((m) => (m.default ?? m) as unknown as MermaidLike),
        options,
        config,
    );
}
