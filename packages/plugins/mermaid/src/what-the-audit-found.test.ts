/**
 * The Mermaid renderer against what its audit found: chats sharing one Mermaid, labels
 * Mermaid serialises as HTML, a CSP that refuses the image, skins, shadow roots, and two
 * diagrams arriving at once.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { AparteConfig, aparteGlobalConfig, renderCodeLanguages, type AparteCodeLanguageContext } from '@aparte/core';
import { setupMermaidWith, type MermaidLike } from './core.js';

const BOX = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><g><text>A</text></g></svg>';

function fakeMermaid(svg = BOX) {
    const rendered: string[] = [];
    const mermaid: MermaidLike = {
        initialize: () => {},
        parse: (text) => Promise.resolve(!text.includes('BAD')),
        render: (_id, text) => { rendered.push(text); return Promise.resolve({ svg }); },
    };
    return { mermaid, rendered };
}

function ctx(source: string, host: HTMLElement, over: Partial<AparteCodeLanguageContext> = {}): AparteCodeLanguageContext {
    return { language: 'mermaid', source, display: true, open: false, host, config: aparteGlobalConfig, ...over };
}

/** A placeholder inside a reply part of its own, as core's segments give it. */
function inPart(id: string): HTMLElement {
    const part = document.createElement('div');
    part.setAttribute('data-segment-id', id);
    part.innerHTML = '<pre><code class="language-mermaid"></code></pre>';
    document.body.appendChild(part);
    return part.querySelector('code')!;
}

const renderer = (config: AparteConfig = aparteGlobalConfig) => config.getCodeLanguageRenderer('mermaid')!;

beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('two chats on one Mermaid', () => {
    it('draws each diagram with its own chat\'s options, and never two at once', async () => {
        // Mermaid keeps one configuration, which `initialize` replaces and `render` reads.
        let current: Record<string, unknown> = {};
        const seen: Array<{ id: string; curve: unknown }> = [];
        const mermaid: MermaidLike = {
            initialize: (c) => { current = c; },
            parse: () => Promise.resolve(true),
            render: async (id) => {
                await new Promise((r) => setTimeout(r, 5));
                seen.push({ id, curve: (current['flowchart'] as Record<string, unknown>)['curve'] });
                return { svg: BOX };
            },
        };
        const a = new AparteConfig();
        const b = new AparteConfig();
        setupMermaidWith(mermaid, { mermaid: { flowchart: { curve: 'basis' } } }, a);
        setupMermaidWith(mermaid, { mermaid: { flowchart: { curve: 'step' } } }, b);
        await Promise.all([
            renderer(a).render({ ...ctx('graph A', inPart('a')), config: a }),
            renderer(b).render({ ...ctx('graph B', inPart('b')), config: b }),
        ]);
        expect(seen.map((s) => s.curve)).toEqual(['basis', 'step']);
        expect(new Set(seen.map((s) => s.id)).size).toBe(2);
    });
});

describe('a label Mermaid writes as HTML', () => {
    it.each([
        ['a no-break space', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><text>Étape 1&nbsp;: début</text></svg>', 'Étape 1 : début'],
        ['a named entity', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><text>I &hearts; it</text></svg>', 'I ♥ it'],
    ])('draws one carrying %s', async (_what, svg, label) => {
        setupMermaidWith(fakeMermaid(svg).mermaid);
        const html = await renderer().render(ctx('flowchart TD', inPart('s')));
        expect(html).toContain('aparte-diagram');
        const el = document.createElement('div');
        el.innerHTML = html!;
        expect(decodeURIComponent(el.querySelector('img')!.getAttribute('src')!)).toContain(label);
    });

    it('refuses what was not one clean SVG', async () => {
        setupMermaidWith(fakeMermaid(`${BOX}<p>after</p>`).mermaid);
        expect(await renderer().render(ctx('flowchart TD', inPart('s')))).toContain('aparte-code-error');
    });
});

describe('a page whose CSP refuses the image', () => {
    it('shows the source, once, however often the drawing is relabelled', async () => {
        setupMermaidWith(fakeMermaid().mermaid);
        const code = inPart('s');
        code.textContent = 'flowchart TD\n  A --> B';
        renderCodeLanguages(code.closest('[data-segment-id]')!);
        await vi.waitFor(() => expect(document.querySelector('img.aparte-diagram')).not.toBeNull());
        const img = document.querySelector<HTMLImageElement>('img.aparte-diagram')!;
        const listen = vi.spyOn(img, 'addEventListener');
        const drawing = img.parentElement!;
        for (let i = 0; i < 5; i++) renderer().relabel!(drawing, ctx(code.textContent, code));
        expect(listen).not.toHaveBeenCalled();
        img.dispatchEvent(new Event('error'));
        expect(drawing.querySelector('img')).toBeNull();
        expect(drawing.querySelector('pre.aparte-code-error')!.textContent).toBe('flowchart TD\n  A --> B');
    });
});

describe('the colours a drawing depends on', () => {
    it('tells two skins apart that share a theme name', () => {
        setupMermaidWith(fakeMermaid().mermaid);
        const plain = inPart('plain');
        const brand = inPart('brand');
        brand.style.setProperty('--aparte-primary', '#c2410c');
        for (const host of [plain, brand]) host.closest('div')!.setAttribute('data-aparte-theme', 'light');
        expect(renderer().cacheKey!(ctx('flowchart TD', brand))).not.toBe(renderer().cacheKey!(ctx('flowchart TD', plain)));
    });
});

describe('a chat inside a shadow root', () => {
    it('draws its diagrams again when its theme changes in there', async () => {
        const { mermaid, rendered } = fakeMermaid();
        setupMermaidWith(mermaid);
        const widget = document.createElement('div');
        document.body.appendChild(widget);
        const shadow = widget.attachShadow({ mode: 'open' });
        const chat = document.createElement('div');
        chat.setAttribute('data-aparte-theme', 'light');
        chat.innerHTML = '<pre><code class="language-mermaid">flowchart TD\n  A --> B</code></pre>';
        shadow.appendChild(chat);
        renderCodeLanguages(chat);
        await vi.waitFor(() => expect(rendered).toHaveLength(1));

        chat.setAttribute('data-aparte-theme', 'dark');
        await vi.waitFor(() => expect(rendered).toHaveLength(2));
    });

    it('lets a widget taken off the page go, rather than drawing it again', async () => {
        const { mermaid, rendered } = fakeMermaid();
        setupMermaidWith(mermaid);
        const widget = document.createElement('div');
        document.body.appendChild(widget);
        const chat = document.createElement('div');
        chat.innerHTML = '<pre><code class="language-mermaid">flowchart TD\n  A --> B</code></pre>';
        widget.attachShadow({ mode: 'open' }).appendChild(chat);
        renderCodeLanguages(chat);
        await vi.waitFor(() => expect(rendered).toHaveLength(1));

        widget.remove();
        document.documentElement.setAttribute('data-aparte-theme', 'dark');
        await new Promise((r) => setTimeout(r, 20));
        document.documentElement.removeAttribute('data-aparte-theme');
        await new Promise((r) => setTimeout(r, 20));
        expect(rendered).toHaveLength(1);
    });
});

describe('two diagrams arriving at once', () => {
    it('keeps each part\'s waiting frame: another part\'s diagram does not answer it', async () => {
        vi.useFakeTimers();
        const { mermaid, rendered } = fakeMermaid();
        setupMermaidWith(mermaid);
        const a = inPart('a');
        const b = inPart('b');
        await vi.runAllTimersAsync();
        renderer().render(ctx('flowchart TD\n', a, { open: true }));
        void renderer().render(ctx('flowchart TD\n  X\n', a, { open: true }));
        await vi.advanceTimersByTimeAsync(10);
        const streaming = renderer().render(ctx('flowchart TD\n  X --> Y\n', a, { open: true }));
        // A closed diagram with the same first line, in another part, drawn meanwhile.
        await renderer().render(ctx('flowchart TD\n  A --> B', b));
        await vi.advanceTimersByTimeAsync(400);
        expect(await streaming).toContain('aparte-diagram');
        expect(rendered).toContain('flowchart TD\n  X --> Y\n');
    });

    it('drops the waiting frame of the diagram that just closed', async () => {
        vi.useFakeTimers();
        const { mermaid, rendered } = fakeMermaid();
        setupMermaidWith(mermaid);
        const a = inPart('a');
        await vi.runAllTimersAsync();
        renderer().render(ctx('flowchart TD\n', a, { open: true }));
        void renderer().render(ctx('flowchart TD\n  X\n', a, { open: true }));
        await vi.advanceTimersByTimeAsync(10);
        const waiting = renderer().render(ctx('flowchart TD\n  X --> Y\n', a, { open: true }));
        const closed = renderer().render(ctx('flowchart TD\n  X --> Y\n', a));
        await vi.advanceTimersByTimeAsync(400);
        expect(await waiting).toBeNull();
        expect(await closed).toContain('aparte-diagram');
        expect(rendered).toEqual(['flowchart TD\n  X\n', 'flowchart TD\n  X --> Y\n']);
    });

    it('asks Mermaid nothing while the first line is still arriving', async () => {
        vi.useFakeTimers();
        const { mermaid, rendered } = fakeMermaid();
        setupMermaidWith(mermaid);
        const a = inPart('a');
        await vi.runAllTimersAsync();
        renderer().render(ctx('flow', a, { open: true }));
        void renderer().render(ctx('flowchart', a, { open: true }));
        void renderer().render(ctx('flowchart T', a, { open: true }));
        await vi.advanceTimersByTimeAsync(1000);
        expect(rendered).toEqual([]);
    });
});
