import { describe, it, expect, vi } from 'vitest';
import { setupShikiProvider } from './index.js';
import { AparteConfig } from '@aparte/core';

describe('@aparte/plugin-shiki', () => {
    it('registers shiki as the highlight provider', async () => {
        const spy = vi.spyOn(AparteConfig, 'setHighlightProvider');
        await setupShikiProvider();
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('highlights code (loads the grammar on demand)', async () => {
        let captured: ((code: string, lang: string) => string | Promise<string>) | undefined;
        vi.spyOn(AparteConfig, 'setHighlightProvider').mockImplementation((p) => {
            captured = p;
        });

        await setupShikiProvider({ theme: 'github-dark' });

        expect(captured).toBeDefined();
        const result = await captured!('const x = 1;', 'javascript');
        expect(result).toContain('<span');
        expect(result).toContain('color:');
    });

    it('falls back to plain text for an unknown grammar', async () => {
        let captured: ((code: string, lang: string) => string | Promise<string>) | undefined;
        vi.spyOn(AparteConfig, 'setHighlightProvider').mockImplementation((p) => {
            captured = p;
        });

        await setupShikiProvider();

        // A bogus language must not throw — it degrades to plaintext rendering.
        const result = await captured!('plain body', 'not-a-real-language');
        expect(result).toContain('<pre');
        expect(result).toContain('plain body');
    });
});
