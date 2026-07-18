/**
 * Sibling-Nav Renderer
 *
 * Replace the branch position indicator — the default `‹ N / M ›` counter between
 * the prev/next arrows — e.g. with a row of dots. Return an HTML **string**
 * (multiple roots allowed, set via innerHTML) or a single **HTMLElement**
 * (charter §6 render hooks: `string | HTMLElement`). Called whenever the active
 * sibling / count changes.
 *
 * The prev/next arrows and their behavior (dispatching `aparte-branch-navigate`) are
 * kept — this hook customizes only the indicator. For click-to-jump navigation,
 * dispatch your own events / use the imperative API from your rendered output.
 *
 * @example
 * AparteConfig.setSiblingNavRenderer(({ count, index }) =>
 *   Array.from({ length: count }, (_, i) =>
 *     `<span class="dot${i === index ? ' active' : ''}"></span>`).join(''));
 *
 * @param ctx.count - Total number of siblings (> 1 when a picker shows).
 * @param ctx.index - 0-based index of the active sibling.
 * @returns HTML string or a DOM element for the indicator.
 */
export type AparteSiblingNavRenderer = (ctx: { count: number; index: number }) => string | HTMLElement;
