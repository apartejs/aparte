/**
 * The package entry imports Mermaid itself, on the first diagram — stood in for here,
 * since the real one cannot lay anything out in jsdom.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, type AparteCodeLanguageContext } from '@aparte/core';

const rendered: string[] = [];
vi.mock('mermaid', () => ({
    default: {
        initialize: () => {},
        parse: () => Promise.resolve(true),
        render: (_id: string, text: string) => {
            rendered.push(text);
            return Promise.resolve({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>' });
        },
    },
}));

afterEach(() => aparteGlobalConfig.reset());

describe('setupMermaid', () => {
    it('loads mermaid on the first diagram and draws with it', async () => {
        const { setupMermaid } = await import('./index.js');
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
        const dispose = setupMermaid();
        const host = document.createElement('code');
        document.body.appendChild(host);
        const ctx: AparteCodeLanguageContext = { language: 'mermaid', source: 'flowchart TD', display: true, open: false, host, config: aparteGlobalConfig };
        expect(await aparteGlobalConfig.getCodeLanguageRenderer('mermaid')!.render(ctx)).toContain('aparte-diagram');
        expect(rendered).toEqual(['flowchart TD']);
        dispose();
    });
});
