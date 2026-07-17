import { describe, it, expect, vi } from 'vitest';
import { setupMarkedProvider } from './index.js';
import { AparteConfig } from '@aparte/core';

describe('@aparte/plugin-marked', () => {
    it('registers marked as the markdown provider', () => {
        const spy = vi.spyOn(AparteConfig, 'setMarkdownProvider');
        setupMarkedProvider();
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('renders markdown to HTML synchronously', () => {
        let provider: ((raw: string) => string) | undefined;
        vi.spyOn(AparteConfig, 'setMarkdownProvider').mockImplementation((p) => { provider = p; });

        setupMarkedProvider();

        expect(provider).toBeDefined();
        const html = provider!('# Hello');
        expect(html).toContain('<h1>Hello</h1>');
        // Must be a plain string, not a Promise (async:false).
        expect(typeof html).toBe('string');
        vi.restoreAllMocks();
    });

    it('applies extension options via marked.use', () => {
        let provider: ((raw: string) => string) | undefined;
        vi.spyOn(AparteConfig, 'setMarkdownProvider').mockImplementation((p) => { provider = p; });

        setupMarkedProvider({ breaks: true });
        const html = provider!('a\nb');
        expect(html).toContain('<br>');
        vi.restoreAllMocks();
    });
});
