import { describe, it, expect, vi } from 'vitest';
import { AparteConfig } from '@aparte/core';

// Mock scoped to THIS file only: make the FIRST createHighlighter call reject
// (a transient failure), then delegate to the real shiki for every later call.
const state = vi.hoisted(() => ({ calls: 0 }));
vi.mock('shiki', async (importOriginal) => {
    const actual = await importOriginal<typeof import('shiki')>();
    return {
        ...actual,
        createHighlighter: (opts: Parameters<typeof actual.createHighlighter>[0]) => {
            state.calls += 1;
            if (state.calls === 1) return Promise.reject(new Error('transient createHighlighter failure'));
            return actual.createHighlighter(opts);
        },
    };
});

describe('@aparte/plugin-shiki — resilience', () => {
    it('recovers on a later call after a transient createHighlighter failure', async () => {
        const { setupShikiProvider } = await import('./index.js');

        let captured: ((code: string, lang: string) => string | Promise<string>) | undefined;
        vi.spyOn(AparteConfig, 'setHighlightProvider').mockImplementation((p) => {
            captured = p;
        });

        await setupShikiProvider();
        expect(captured).toBeDefined();

        // First code block: creation rejects → the provider rejects for THIS block
        // (core degrades it to plaintext).
        await expect(captured!('const x = 1;', 'javascript')).rejects.toThrow();

        // Second code block: the singleton must NOT be poisoned — it retries
        // creation and highlights successfully.
        const html = await captured!('const x = 1;', 'javascript');
        expect(html).toContain('<span');
        expect(html).toContain('color:');
    });
});
