import { AparteConfig } from '@aparte/core';
/**
 * The slice of a shiki highlighter this plugin actually uses — declared here rather
 * than borrowed from `HighlighterCore`, so this module needs no import from shiki at
 * all, not even a type. A real `HighlighterCore` satisfies it (asserted at compile
 * time in the tests), and so does a wrapper of your own.
 */
export interface ShikiHighlighterLike {
    /** The grammars this highlighter carries — read once, then cached. */
    getLoadedLanguages(): string[];
    /** Render `code` as highlighted HTML with a loaded grammar + theme. */
    codeToHtml(code: string, options: { lang: string; theme: string }): string;
}

export interface ShikiCoreProviderOptions {
    /**
     * Theme to render with — the name of a theme your highlighter was built with.
     * Default `'github-dark'`.
     */
    theme?: string;
}

/** Languages that mean "don't highlight", plus the empty string. */
export const PLAINTEXT = new Set(['text', 'plaintext', 'txt', 'ansi', '']);

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
): void {
    const theme = options.theme ?? 'github-dark';
    let loaded: Set<string> | null = null;

    AparteConfig.setHighlightProvider((code, lang) => {
        const requested = (lang || 'text').toLowerCase();
        // Cached after the first call: the grammar set of a core highlighter is fixed.
        loaded ??= new Set(highlighter.getLoadedLanguages());
        const language = PLAINTEXT.has(requested) || !loaded.has(requested) ? 'text' : requested;
        return highlighter.codeToHtml(code, { lang: language, theme });
    });
}
