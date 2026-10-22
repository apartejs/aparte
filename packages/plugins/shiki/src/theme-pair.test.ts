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

    it('puts ONE stylesheet in the document, switched by the three theme states', () => {
        const hl = { getLoadedLanguages: () => [], codeToHtml: () => '' };
        setupShikiProviderFromHighlighter(hl, { theme: { light: 'a', dark: 'b' } });
        setupShikiProviderFromHighlighter(hl, { theme: { light: 'a', dark: 'b' } });

        const sheets = document.querySelectorAll('style#aparte-shiki-theme-pair');
        expect(sheets).toHaveLength(1);
        const css = sheets[0]!.textContent!;
        // An explicit dark turns the switch on, an explicit light off; with no attribute the
        // OS decides — core's own three states.
        expect(css).toContain('[data-aparte-theme="dark"]{--aparte-shiki-dark-on: ;}');
        expect(css).toContain('[data-aparte-theme="light"]{--aparte-shiki-dark-on:initial;}');
        expect(css).toContain('@media (prefers-color-scheme: dark){:root:not([data-aparte-theme]){--aparte-shiki-dark-on: ;}}');
    });

    it('reads the switch the nearest attribute set, never color-scheme', () => {
        // Measured in Chromium, WebKit and Firefox, with a host writing html { color-scheme:
        // light dark } (Angular Material does): a chat forced light in a dark page gets light
        // code, a dark one in a light page dark code, and the host's color-scheme changes
        // nothing. The switch is an inherited custom property: the nearest attribute wins.
        const hl = { getLoadedLanguages: () => [], codeToHtml: () => '' };
        setupShikiProviderFromHighlighter(hl, { theme: { light: 'a', dark: 'b' } });
        const css = document.getElementById('aparte-shiki-theme-pair')!.textContent!;
        expect(css).toContain('.shiki{--aparte-shiki-fg:var(--aparte-shiki-dark-on) var(--shiki-dark);--aparte-shiki-bg:var(--aparte-shiki-dark-on) var(--shiki-dark-bg);color:var(--aparte-shiki-fg,var(--shiki-light));background-color:var(--aparte-shiki-bg,var(--shiki-light-bg))}');
        expect(css).toContain('.shiki span{--aparte-shiki-fg:var(--aparte-shiki-dark-on) var(--shiki-dark);color:var(--aparte-shiki-fg,var(--shiki-light))}');
        expect(css).not.toContain('light-dark(');
        expect(css).not.toMatch(/[{;]color-scheme:/);
    });

    it('adds no stylesheet for a single theme — nothing to switch', () => {
        setupShikiProviderFromHighlighter({ getLoadedLanguages: () => [], codeToHtml: () => '' }, { theme: 'github-dark' });
        expect(document.getElementById('aparte-shiki-theme-pair')).toBeNull();
    });
});
