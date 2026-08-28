// @vitest-environment jsdom
/**
 * A `{ light, dark }` theme pair.
 *
 * One theme paints one scheme, so `github-dark` stayed a dark slab inside a light chat
 * and nothing could say otherwise. With a pair the highlighter writes both colours per
 * token as CSS variables and no colour of its own (`defaultColor: false`), and ONE
 * stylesheet reads the right one under core's `[data-aparte-theme="dark"]`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { setupShikiProviderFromHighlighter } from './core.js';
import { aparteGlobalConfig } from '@aparte/core';

type Captured = ((code: string, lang: string) => string | Promise<string>) | undefined;

afterEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = '';
});

describe('a light/dark theme pair', () => {
    it('renders with both themes and no default colour, so the stylesheet picks the scheme', async () => {
        let captured: Captured;
        vi.spyOn(aparteGlobalConfig, 'setHighlightProvider').mockImplementation((p) => { captured = p as Captured; });
        const hl = { getLoadedLanguages: () => ['typescript'], codeToHtml: vi.fn(() => '<pre class="shiki"></pre>') };

        setupShikiProviderFromHighlighter(hl, { theme: { light: 'github-light', dark: 'github-dark' } });
        await captured!('const x = 1;', 'typescript');

        expect(hl.codeToHtml).toHaveBeenCalledWith('const x = 1;', {
            lang: 'typescript',
            themes: { light: 'github-light', dark: 'github-dark' },
            defaultColor: false,
        });
    });

    it('puts ONE stylesheet in the document, and it follows [data-aparte-theme="dark"]', () => {
        const hl = { getLoadedLanguages: () => [], codeToHtml: () => '' };
        setupShikiProviderFromHighlighter(hl, { theme: { light: 'a', dark: 'b' } });
        setupShikiProviderFromHighlighter(hl, { theme: { light: 'a', dark: 'b' } });

        const sheets = document.querySelectorAll('style#aparte-shiki-theme-pair');
        expect(sheets).toHaveLength(1);
        expect(sheets[0]!.textContent).toContain('[data-aparte-theme="dark"] .shiki');
        expect(sheets[0]!.textContent).toContain('var(--shiki-dark)');
        expect(sheets[0]!.textContent).toContain('var(--shiki-light-bg)');
    });

    it('adds no stylesheet for a single theme — nothing to switch', () => {
        setupShikiProviderFromHighlighter({ getLoadedLanguages: () => [], codeToHtml: () => '' }, { theme: 'github-dark' });
        expect(document.getElementById('aparte-shiki-theme-pair')).toBeNull();
    });
});
