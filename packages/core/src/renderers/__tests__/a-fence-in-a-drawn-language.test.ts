// @vitest-environment jsdom
/**
 * A fence whose language a renderer draws is a drawing, not coloured code.
 *
 * Every fence in a streamed reply is a `code` segment, so this is where a diagram
 * arrives whichever Markdown provider is installed — or none. The pane keeps the
 * source in a plain `<pre><code>`, written as it streams, and the drawing goes beside it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { codeRenderer } from '../segments/code.js';
import { aparteGlobalConfig } from '../../config/index.js';
import type { AparteCodeLanguageContext } from '../../config/aparte-config.js';
import type { AparteCodeSegment } from '../../types/index.js';

const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

function mount(segment: AparteCodeSegment): HTMLElement {
    const holder = document.createElement('div');
    holder.innerHTML = codeRenderer.render(segment) as string;
    const element = holder.firstElementChild as HTMLElement;
    document.body.appendChild(element);
    codeRenderer.setup?.(element, segment);
    return element;
}

function installDiagrams(): AparteCodeLanguageContext[] {
    const asked: AparteCodeLanguageContext[] = [];
    aparteGlobalConfig.registerCodeLanguageRenderer({
        languages: ['mermaid'],
        render: (ctx) => { asked.push(ctx); return `<img class="aparte-diagram" alt="Diagram" data-source="${ctx.source.length}">`; },
    });
    return asked;
}

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

describe('a fence in a drawn language', () => {
    it('is drawn, and never sent to the highlighter', async () => {
        const highlight = vi.fn((code: string) => `<pre><code>${code}</code></pre>`);
        aparteGlobalConfig.setHighlightProvider(highlight);
        installDiagrams();
        const el = mount({ id: 'd1', type: 'code', language: 'mermaid', content: 'flowchart TD\n  A --> B', isStreaming: false });
        await flush();

        expect(el.querySelector('img.aparte-diagram')).not.toBeNull();
        expect(el.querySelector('pre > code.language-mermaid')!.textContent).toBe('flowchart TD\n  A --> B');
        expect(highlight).not.toHaveBeenCalled();
    });

    it('keeps its code card, unless its renderer draws the whole block (bare)', async () => {
        installDiagrams();
        const diagram = mount({ id: 'b1', type: 'code', language: 'mermaid', content: 'flowchart TD', isStreaming: false });
        expect(diagram.hasAttribute('data-aparte-bare')).toBe(false);
        aparteGlobalConfig.registerCodeLanguageRenderer({ languages: ['card-note'], bare: true, render: () => '<div class="note"></div>' });
        const card = mount({ id: 'b2', type: 'code', language: 'card-note', content: '{}', isStreaming: false });
        await flush();
        expect(card.hasAttribute('data-aparte-bare')).toBe(true);
        expect(card.querySelector('.note')).not.toBeNull();
    });

    it('is drawn as it streams, then once more when it closes', () => {
        const asked = installDiagrams();
        const segment: AparteCodeSegment = { id: 'd2', type: 'code', language: 'mermaid', content: '', isStreaming: true };
        const el = mount(segment);
        codeRenderer.update?.(el, { ...segment, content: 'flowchart TD\n  A' });
        codeRenderer.update?.(el, { ...segment, content: 'flowchart TD\n  A --> B' });
        codeRenderer.update?.(el, { ...segment, content: 'flowchart TD\n  A --> B', isStreaming: false });

        expect(asked.map((c) => [c.source, c.open])).toEqual([
            ['flowchart TD\n  A', true],
            ['flowchart TD\n  A --> B', true],
            ['flowchart TD\n  A --> B', false],
        ]);
        expect(el.querySelectorAll('img.aparte-diagram')).toHaveLength(1);
    });

    it('reads the language from the first word of the info string', () => {
        installDiagrams();
        const el = mount({ id: 'd3', type: 'code', language: 'mermaid title="flow"', content: 'flowchart TD', isStreaming: false });
        expect(el.querySelector('img.aparte-diagram')).not.toBeNull();
    });

    it('puts the plain source back where a highlight ran before the renderer came', async () => {
        aparteGlobalConfig.setHighlightProvider((code) => `<pre class="shiki"><code>${code}</code></pre>`);
        const segment: AparteCodeSegment = { id: 'd4', type: 'code', language: 'mermaid', content: 'flowchart TD', isStreaming: false };
        const el = mount(segment);
        await flush();
        expect(el.querySelector('pre.shiki')).not.toBeNull();

        installDiagrams();
        codeRenderer.update?.(el, segment);
        expect(el.querySelector('pre.shiki')).toBeNull();
        expect(el.querySelector('img.aparte-diagram')).not.toBeNull();
    });

    it('copies the diagram source, not what the pane shows', () => {
        const writeText = vi.fn(() => Promise.resolve());
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        installDiagrams();
        const el = mount({ id: 'd5', type: 'code', language: 'mermaid', content: 'flowchart TD\n  A --> B', isStreaming: false });
        el.querySelector<HTMLElement>('.aparte-code-copy')!.click();
        expect(writeText).toHaveBeenCalledWith('flowchart TD\n  A --> B');
    });
});
