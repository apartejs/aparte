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

const PLAINTEXT = new Set(['text', 'plaintext', 'txt', 'ansi', '']);

/**
 * Register [shiki](https://shiki.style) as aparté's syntax-highlight provider.
 *
 * Backed by a **single, lazily-created** `createHighlighter` instance: the
 * highlighter is built once on first use with only the requested theme, and each
 * language grammar is loaded on demand and cached. This is deliberately NOT the
 * `codeToHtml` shorthand, which can re-initialise a highlighter per call — the
 * cost we control here is why the plugin exists.
 *
 * Bundle note: nothing is eagerly bundled. Grammars/themes are dynamically
 * imported from shiki's bundle the first time they are seen, so the highlighted
 * languages a consumer actually renders are what they pay for.
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
