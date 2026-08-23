import { describe, it, expect, vi, afterEach } from 'vitest';
import { setupShikiProviderFromHighlighter, type ShikiHighlighterLike } from './core.js';
import { aparteGlobalConfig } from '@aparte/core';
import type { HighlighterCore } from 'shiki/core';

/**
 * Compile-time contract: the narrow shape this plugin asks for must accept a REAL
 * `HighlighterCore`. Declared as a type, so it costs nothing at runtime — but the
 * build fails if the two ever drift, which is the only way the narrow type stays
 * honest without importing shiki in the module itself.
 */
const _acceptsRealHighlighter: ShikiHighlighterLike = null as unknown as HighlighterCore;
void _acceptsRealHighlighter;

/**
 * The `/core` entry exists for one reason: the convenience entry imports shiki's
 * full bundle, so a bundler emits one chunk per known grammar — measured at 302
 * files / 11 MB for a build whose only import was the plugin, against 1 file /
 * 560 kB for a highlighter built with three grammars. A runtime option cannot fix
 * that (restricting `langs` still emitted all 302), so the fix is an entry point
 * that never imports the bundle — which is also why this file asserts behaviour
 * only: the size property is a property of the import graph, and is verified by
 * `dist/core.js` importing nothing but `@aparte/core`.
 */

type Captured = ((code: string, lang: string) => string | Promise<string>) | undefined;

function captureProvider(): { get: () => Captured } {
    let captured: Captured;
    vi.spyOn(aparteGlobalConfig, 'setHighlightProvider').mockImplementation((p) => {
        captured = p as Captured;
    });
    return { get: () => captured };
}

/** A stand-in for a HighlighterCore the consumer built themselves. */
function fakeHighlighter(langs: string[]) {
    return {
        getLoadedLanguages: vi.fn(() => langs),
        codeToHtml: vi.fn((code: string, opts: { lang: string; theme: string }) =>
            `<pre data-lang="${opts.lang}" data-theme="${opts.theme}">${code}</pre>`),
    };
}

afterEach(() => vi.restoreAllMocks());

describe('setupShikiProviderFromHighlighter', () => {
    it('registers the highlighter the app built, and renders with it', async () => {
        const provider = captureProvider();
        const hl = fakeHighlighter(['typescript']);

        setupShikiProviderFromHighlighter(hl, { theme: 'my-theme' });

        expect(provider.get()).toBeDefined();
        const html = await provider.get()!('const x = 1;', 'typescript');
        expect(html).toContain('data-lang="typescript"');
        expect(html).toContain('data-theme="my-theme"');
        expect(hl.codeToHtml).toHaveBeenCalledTimes(1);
    });

    it('renders a grammar the highlighter does not carry as plain text', async () => {
        const provider = captureProvider();
        const hl = fakeHighlighter(['typescript']);

        setupShikiProviderFromHighlighter(hl);

        // No on-demand load is possible here (that is the trade for the small
        // bundle), so an absent grammar must degrade, not throw.
        const html = await provider.get()!('SELECT 1', 'sql');
        expect(html).toContain('data-lang="text"');
        expect(hl.codeToHtml).toHaveBeenCalledWith('SELECT 1', { lang: 'text', theme: 'github-dark' });
    });

    it('treats the plaintext aliases and a missing language as text', async () => {
        const provider = captureProvider();
        const hl = fakeHighlighter(['typescript', 'text']);

        setupShikiProviderFromHighlighter(hl);

        for (const lang of ['text', 'plaintext', 'txt', 'ansi', '']) {
            expect(await provider.get()!('x', lang)).toContain('data-lang="text"');
        }
    });

    it('is case-insensitive about the language, like the convenience entry', async () => {
        const provider = captureProvider();
        const hl = fakeHighlighter(['typescript']);

        setupShikiProviderFromHighlighter(hl);

        expect(await provider.get()!('const x = 1;', 'TypeScript')).toContain('data-lang="typescript"');
    });

    it('asks the highlighter for its grammar list once, not per block', async () => {
        const provider = captureProvider();
        const hl = fakeHighlighter(['typescript']);

        setupShikiProviderFromHighlighter(hl);
        await provider.get()!('a', 'typescript');
        await provider.get()!('b', 'typescript');
        await provider.get()!('c', 'sql');

        expect(hl.getLoadedLanguages).toHaveBeenCalledTimes(1);
    });

    it('needs no AparteClient — it is a standalone function', () => {
        // The capability must not be hostage to the client: this is the same rule
        // the default renderers now follow. Registering must work with nothing
        // else set up.
        const provider = captureProvider();
        expect(() => setupShikiProviderFromHighlighter(fakeHighlighter(['ts']))).not.toThrow();
        expect(provider.get()).toBeDefined();
    });
});
