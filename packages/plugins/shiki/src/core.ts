import { aparteGlobalConfig , type AparteConfig} from '@aparte/core';
/**
 * The slice of a shiki highlighter this plugin actually uses — declared here rather
 * than borrowed from `HighlighterCore`, so this module needs no import from shiki at
 * all, not even a type. A real `HighlighterCore` satisfies it (asserted at compile
 * time in the tests), and so does a wrapper of your own.
 */
export interface ShikiHighlighterLike {
    /** The grammars this highlighter carries — read once, then cached. */
    getLoadedLanguages(): string[];
    /** Render `code` as highlighted HTML with a loaded grammar and one theme, or a light/dark pair. */
    codeToHtml(code: string, options: ShikiRenderOptions): string;
}

/**
 * A theme for each of the two colour schemes core switches between. A type literal
 * rather than an interface: shiki's `themes` option is a string-keyed record, and only
 * a literal type is implicitly assignable to one.
 */
export type ShikiThemePair = { light: string; dark: string };

/** What either entry hands to `codeToHtml` — shiki's own option names, nothing invented. */
export type ShikiRenderOptions =
    | { lang: string; theme: string }
    | { lang: string; themes: ShikiThemePair; defaultColor: false };

export interface ShikiCoreProviderOptions {
    /**
     * Theme to render with — the name of a theme your highlighter was built with — or a
     * `{ light, dark }` pair of them, which follows core's `[data-aparte-theme="dark"]`
     * switch. Default `'github-dark'`.
     */
    theme?: string | ShikiThemePair;
}

/** Languages that mean "don't highlight", plus the empty string. */
export const PLAINTEXT = new Set(['text', 'plaintext', 'txt', 'ansi', '']);

/** One theme renders with `theme`; a pair renders both colours per token and no default. */
export function renderOptions(theme: string | ShikiThemePair, lang: string): ShikiRenderOptions {
    return typeof theme === 'string' ? { lang, theme } : { lang, themes: theme, defaultColor: false };
}

const PAIR_STYLE_ID = 'aparte-shiki-theme-pair';

/**
 * The stylesheet a theme pair needs, added to the document once.
 *
 * With `defaultColor: false` shiki writes both colours on every token as CSS variables
 * (`--shiki-light`, `--shiki-dark`, plus `-bg` on the block) and sets no colour of its
 * own, so someone has to read the right one. That someone is not core — core knows
 * nothing about shiki's variables — and not the consumer either, who asked for a pair
 * precisely so the block would follow the theme by itself. The switch is core's public
 * theme contract, `[data-aparte-theme="dark"]`, documented in theme.css.
 */
export function ensureThemePairStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(PAIR_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PAIR_STYLE_ID;
    // Three states, the same three core's theme.css answers: an explicit `dark`, an
    // explicit `light`, and no attribute at all — where the OS decides. And the NEAREST
    // attribute decides, not the page's: a chat forced light inside a dark page gets light
    // code. Both through one inherited switch of aparté's own name, which every attributed
    // element sets for its subtree:
    //
    //   on  = a space          → `var(on) var(--shiki-dark)` is the dark colour
    //   off = `initial` (invalid) → the whole value is invalid, the fallback (light) applies
    //
    // Not `color-scheme`, which `light-dark()` would read: a host page sets that too —
    // Angular Material writes `html { color-scheme: light dark }`, over the attribute the
    // Angular wrapper puts on `<html>` — and the code would follow the host, not the chat.
    // A custom attribute value sets nothing, and follows what is above it, as core's palette
    // does.
    const on = '--aparte-shiki-dark-on';
    const fg = `var(${on}) var(--shiki-dark)`;
    const bg = `var(${on}) var(--shiki-dark-bg)`;
    style.textContent =
        `@media (prefers-color-scheme: dark){:root:not([data-aparte-theme]){${on}: ;}}`
        + `[data-aparte-theme="dark"]{${on}: ;}`
        + `[data-aparte-theme="light"]{${on}:initial;}`
        + `.shiki{--aparte-shiki-fg:${fg};--aparte-shiki-bg:${bg};color:var(--aparte-shiki-fg,var(--shiki-light));background-color:var(--aparte-shiki-bg,var(--shiki-light-bg))}`
        + `.shiki span{--aparte-shiki-fg:${fg};color:var(--aparte-shiki-fg,var(--shiki-light))}`;
    document.head.appendChild(style);
}

/**
 * Register a highlighter **you** built as aparté's highlight provider.
 *
 * Why this exists — measured, on a build whose only import was the plugin:
 *
 * | entry point                                  | files emitted | weight |
 * | -------------------------------------------- | ------------- | ------ |
 * | `@aparte/plugin-shiki` (shiki's full bundle) | 302           | 11 MB  |
 * | this one, with three grammars                | 1             | 560 kB |
 *
 * The convenience entry imports `shiki`, whose bundle maps **every** known language
 * to a dynamic import, so a bundler emits one chunk per grammar —
 * `emacs-lisp` (780 kB), `wasm`, `wolfram` and 300 others — even for an app that
 * renders twenty. No runtime option can undo that: a static import is a static
 * import (verified — restricting `langs` still emits all 302). Controlling
 * distribution weight means not importing that bundle at all, which is what
 * importing THIS module instead achieves.
 *
 * ```ts
 * import { createHighlighterCore } from 'shiki/core';
 * import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
 * import ts from '@shikijs/langs/typescript';
 * import githubDark from '@shikijs/themes/github-dark';
 * import { setupShikiProviderFromHighlighter } from '@aparte/plugin-shiki/core';
 *
 * setupShikiProviderFromHighlighter(
 *   await createHighlighterCore({
 *     themes: [githubDark],
 *     langs: [ts],
 *     engine: createJavaScriptRegexEngine(),
 *   }),
 * );
 * ```
 *
 * Your highlighter's grammars are fixed, so a language it does not carry renders as
 * plain text rather than throwing — same degradation as the convenience entry, minus
 * the on-demand load it cannot do.
 *
 * Framework-agnostic, and needs no `AparteClient`. Call once at startup.
 */
export function setupShikiProviderFromHighlighter(
    highlighter: ShikiHighlighterLike,
    options: ShikiCoreProviderOptions = {},
    config: AparteConfig = aparteGlobalConfig,
): void {
    const theme = options.theme ?? 'github-dark';
    if (typeof theme !== 'string') ensureThemePairStyles();
    let loaded: Set<string> | null = null;

    config.setHighlightProvider((code, lang) => {
        const requested = (lang || 'text').toLowerCase();
        // Cached after the first call: the grammar set of a core highlighter is fixed.
        loaded ??= new Set(highlighter.getLoadedLanguages());
        const language = PLAINTEXT.has(requested) || !loaded.has(requested) ? 'text' : requested;
        return highlighter.codeToHtml(code, renderOptions(theme, language));
    });
}
