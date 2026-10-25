/**
 * What each `provideAparte` option does at bootstrap: providers, model, locale, the plugin
 * loaders (awaited before the client starts, a failing one reported and skipped), the icon and
 * Markdown providers given directly or by a loader, and the theme mode.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@angular/compiler';
import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { aparteGlobalConfig, type AparteAIProvider, type AparteIconProvider, type AparteLocale } from '@aparte/core';
import { provideAparte, type ProvideAparteOptions } from '../provide-aparte';
import { AparteAiService } from '../aparte-ai.service';

async function boot(options: ProvideAparteOptions): Promise<void> {
    TestBed.configureTestingModule({ providers: [provideAparte(options)] });
    await TestBed.inject(ApplicationInitStatus).donePromise;
}

afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
    document.documentElement.removeAttribute('data-aparte-theme');
});

describe('provideAparte options', () => {
    it('registers the providers, the model and the locale', async () => {
        const register = vi.spyOn(aparteGlobalConfig, 'registerAIProvider').mockImplementation(() => aparteGlobalConfig);
        const model = vi.spyOn(aparteGlobalConfig, 'setModelConfig').mockImplementation(() => aparteGlobalConfig);
        const locale = vi.spyOn(aparteGlobalConfig, 'setLocale').mockImplementation(() => aparteGlobalConfig);
        const provider = { id: 'p' } as unknown as AparteAIProvider;
        const fr = { send: 'Envoyer' } as unknown as AparteLocale;
        await boot({ providers: [provider], modelConfig: { defaultModel: 'm' }, locale: fr, autoConnect: false });
        expect(register).toHaveBeenCalledWith(provider);
        expect(model).toHaveBeenCalledWith({ defaultModel: 'm' });
        expect(locale).toHaveBeenCalledWith(fr);
    });

    it('awaits the plugin loaders before the client starts, and a failing one is reported and skipped', async () => {
        const order: string[] = [];
        vi.spyOn(AparteAiService.prototype, 'connect').mockImplementation(() => { order.push('connect'); });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await boot({
            plugins: {
                actions: [async () => { await Promise.resolve(); order.push('action'); }, () => { throw new Error('nope'); }],
                theme: async () => { order.push('theme'); },
            },
        });
        expect(order).toEqual(['theme', 'action', 'connect']);
        expect(warn).toHaveBeenCalledWith('[aparte] Failed to load action plugin', expect.any(Error));
    });

    it('takes an icon provider directly, or a loader for one', async () => {
        const setIcons = vi.spyOn(aparteGlobalConfig, 'setIconProvider').mockImplementation(() => aparteGlobalConfig);
        const icons = { resolve: () => null } as unknown as AparteIconProvider;
        await boot({ plugins: { icons }, autoConnect: false });
        expect(setIcons).toHaveBeenCalledWith(icons);

        TestBed.resetTestingModule();
        const loader = vi.fn(async () => {});
        await boot({ plugins: { icons: loader }, autoConnect: false });
        expect(loader).toHaveBeenCalledTimes(1);

        TestBed.resetTestingModule();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await boot({ plugins: { icons: async () => { throw new Error('no icons'); } }, autoConnect: false });
        expect(warn).toHaveBeenCalledWith('[aparte] Failed to load icon plugin', expect.any(Error));
    });

    it('takes a Markdown provider (it declares its raw parameter), or a loader', async () => {
        const setMarkdown = vi.spyOn(aparteGlobalConfig, 'setMarkdownProvider').mockImplementation(() => aparteGlobalConfig);
        const render = (raw: string) => `<p>${raw}</p>`;
        await boot({ plugins: { markdown: render }, autoConnect: false });
        expect(setMarkdown).toHaveBeenCalledWith(render);

        TestBed.resetTestingModule();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const loader = vi.fn(async () => { throw new Error('no markdown'); });
        await boot({ plugins: { markdown: loader }, autoConnect: false });
        expect(loader).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith('[aparte] Failed to load markdown plugin', expect.any(Error));
    });

    it('sets a light or dark theme, and follows the system under auto', async () => {
        await boot({ themeMode: 'dark', autoConnect: false });
        expect(document.documentElement.getAttribute('data-aparte-theme')).toBe('dark');

        TestBed.resetTestingModule();
        let listener: ((e: MediaQueryListEvent) => void) | undefined;
        const query = {
            matches: true,
            addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => { listener = fn; },
            removeEventListener: vi.fn(),
        };
        vi.spyOn(window, 'matchMedia').mockImplementation(() => query as unknown as MediaQueryList);
        await boot({ themeMode: 'auto', autoConnect: false });
        expect(document.documentElement.getAttribute('data-aparte-theme')).toBe('dark');
        listener!({ matches: false } as MediaQueryListEvent);
        expect(document.documentElement.getAttribute('data-aparte-theme')).toBe('light');
        TestBed.resetTestingModule();
        expect(query.removeEventListener).toHaveBeenCalledWith('change', listener);
    });
});
