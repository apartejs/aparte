/**
 * Aparte Theming
 * CSS Custom Properties interfaces for theming
 */

// ─────────────────────────────────────────────────────────────────────────────
// Theme Variables
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Any aparté CSS custom property, for typing a theme object or a `style` record:
 *
 * ```ts
 * const brand: AparteThemeVariables = {
 *   '--aparte-primary': '#b45309',
 *   '--aparte-surface-1': '#ffffff',
 * };
 * ```
 *
 * This was a hand-written list of 33 named properties, and it could not work. Ten
 * of the 33 named variables were neither declared nor read anywhere in aparté —
 * so the type autocompleted ten knobs that did nothing — while the real surface is
 * 254 tokens, meaning even the 23 live members were an arbitrary slice presented as
 * the whole. A hand-maintained mirror of a stylesheet that size is wrong the day
 * after it is written, and nothing could tell you.
 *
 * What this trades away, stated rather than glossed: autocomplete, and catching a
 * typo in the part after `--aparte-`. What it buys is that the type cannot lie. The
 * discoverable list is the generated
 * [CSS variables reference](https://apartejs.dev/reference/css-variables/), which
 * is swept from the source on every build and marks which tokens aparté actually
 * reads.
 */
export type AparteThemeVariables = { [K in `--aparte-${string}`]?: string };
