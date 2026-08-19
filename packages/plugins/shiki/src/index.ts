import { AparteConfig } from '@aparte/core';
import {
    createHighlighter,
    type Highlighter,
    type BundledLanguage,
    type BundledTheme,
} from 'shiki';

export interface ShikiProviderOptions {
    /**
     * Theme to render with — a bundled theme name (e.g. `'github-dark'`) or a
     * loaded custom theme name. Default `'github-dark'`.
     */
    theme?: BundledTheme | string;
}

import { PLAINTEXT } from './core.js';

export { setupShikiProviderFromHighlighter } from './core.js';
export type { ShikiCoreProviderOptions, ShikiHighlighterLike } from './core.js';

/**
 * Register [shiki](https://shiki.style) as aparté's syntax-highlight provider.
 *
 * Backed by a **single, lazily-created** `createHighlighter` instance: the
 * highlighter is built once on first use with only the requested theme, and each
 * language grammar is loaded on demand and cached. This is deliberately NOT the
 * `codeToHtml` shorthand, which can re-initialise a highlighter per call — the
 * cost we control here is why the plugin exists.
 *
 * **Bundle note — runtime cost and distribution cost are not the same thing.**
 * At runtime nothing is eager: a grammar is fetched the first time a language is
 * seen, so you only *execute* what you render. But this entry imports `shiki`,
 * whose bundle maps every known language to a dynamic import, so your bundler
 * **emits one chunk per grammar** — measured on a build whose only import was this
 * function: **302 files, 11 MB** (`emacs-lisp` alone is 780 kB). Restricting the
 * language list would not help; a static import is a static import.
 *
 * If the size of what you ship matters — an app delivered by `npx`, a desktop
 * bundle — use {@link setupShikiProviderFromHighlighter} from
 * `@aparte/plugin-shiki/core` and build the highlighter yourself: same plugin,
 * same behaviour, **1 file / 560 kB** for three grammars.
 *
 * Framework-agnostic — vanilla, no framework imports. Call once at startup.
 */
export async function setupShikiProvider(options: ShikiProviderOptions = {}): Promise<void> {
    const theme = (options.theme ?? 'github-dark') as BundledTheme;

    let highlighter: Highlighter | null = null;
    let creating: Promise<Highlighter> | null = null;
    const loadedLangs = new Set<string>();

    const getHighlighter = (): Promise<Highlighter> => {
        if (highlighter) return Promise.resolve(highlighter);
        // De-dupe concurrent first calls so we only ever create one instance.
        if (!creating) {
            creating = createHighlighter({ themes: [theme], langs: [] })
                .then((h) => {
                    highlighter = h;
                    return h;
                })
                .catch((err) => {
                    // A transient failure (network/CSP on the dynamic theme import,
                    // wasm engine hiccup) must NOT poison the singleton: clear the
                    // cached promise so the next code block retries creation instead
                    // of re-returning a permanently-rejected promise. Re-throw so this
                    // block still degrades to plaintext via the provider's caller.
                    creating = null;
                    throw err;
                });
        }
        return creating;
    };

    AparteConfig.setHighlightProvider(async (code, lang) => {
        const hl = await getHighlighter();
        let language = (lang || 'text').toLowerCase();

        if (!PLAINTEXT.has(language) && !loadedLangs.has(language)) {
            try {
                await hl.loadLanguage(language as BundledLanguage);
                loadedLangs.add(language);
            } catch {
                language = 'text'; // unknown grammar → render as plain text
            }
        }

        return hl.codeToHtml(code, { lang: language, theme });
    });
}
