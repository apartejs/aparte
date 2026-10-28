/**
 * The Mermaid renderer, on a stand-in Mermaid: jsdom has no layout, so the real one
 * cannot measure a label. What is real is the plugin — the configuration it forces, the
 * image it makes, the pace it keeps while a diagram arrives — and core's engine.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { aparteGlobalConfig, renderCodeLanguages, type AparteCodeLanguageContext } from '@aparte/core';
import { setupMermaidWith, type MermaidLike } from './core.js';

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

/** A Mermaid that draws a 120×60 box, refuses any source containing BAD, and records what it was told. */
function fakeMermaid(svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60" style="max-width: 120px"><g><text>A</text></g></svg>') {
    const configs: Array<Record<string, unknown>> = [];
    const rendered: string[] = [];
    const mermaid: MermaidLike = {
        initialize: (c) => { configs.push(c); },
        parse: (text) => Promise.resolve(!text.includes('BAD')),
        render: (_id, text) => { rendered.push(text); return Promise.resolve({ svg, diagramType: 'flowchart-v2' }); },
    };
    return { mermaid, configs, rendered };
}

function ctx(source: string, over: Partial<AparteCodeLanguageContext> = {}): AparteCodeLanguageContext {
    const host = document.createElement('code');
    document.body.appendChild(host);
    return { language: 'mermaid', source, display: true, open: false, host, config: aparteGlobalConfig, ...over };
}

const renderer = () => aparteGlobalConfig.getCodeLanguageRenderer('mermaid')!;

beforeEach(() => {
    // jsdom has no canvas; the palette then keeps the browser's computed colours.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-aparte-theme');
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('drawing a diagram', () => {
    it('draws it as an image of its SVG, sized from its viewBox', async () => {
        const { mermaid } = fakeMermaid();
        setupMermaidWith(mermaid);
        const html = await renderer().render(ctx('flowchart TD\n  A --> B'));
        const el = document.createElement('div');
        el.innerHTML = html!;
        const img = el.querySelector('img.aparte-diagram')!;
        expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
        expect(img.getAttribute('width')).toBe('120');
        expect(img.getAttribute('height')).toBe('60');
        expect(decodeURIComponent(img.getAttribute('src')!)).not.toContain('max-width');
    });

    it('forces the settings that keep a model-written diagram harmless', async () => {
        const { mermaid, configs } = fakeMermaid();
        setupMermaidWith(mermaid, { mermaid: { securityLevel: 'loose', htmlLabels: true, flowchart: { htmlLabels: true, curve: 'basis' } } });
        await renderer().render(ctx('flowchart TD'));
        const c = configs[0]!;
        expect(c['securityLevel']).toBe('strict');
        expect(c['htmlLabels']).toBe(false);
        expect(c['flowchart']).toEqual({ htmlLabels: false, curve: 'basis' });
        expect(c['secure']).toEqual(expect.arrayContaining(['securityLevel', 'htmlLabels', 'flowchart', 'themeCSS']));
    });

    it('answers a diagram that does not parse with a note and its source', async () => {
        const { mermaid } = fakeMermaid();
        setupMermaidWith(mermaid);
        const root = document.createElement('div');
        root.innerHTML = '<pre><code class="language-mermaid">flowchart TD\n  A --> BAD &lt;b&gt;</code></pre>';
        document.body.appendChild(root);
        renderCodeLanguages(root);
        await flush();
        expect(root.querySelector('[data-aparte-diagram-error]')!.textContent).toBe('This diagram could not be drawn.');
        expect(root.querySelector('.aparte-code-drawing pre.aparte-code-error')!.textContent).toContain('BAD <b>');
        expect(root.querySelector('.aparte-code-drawing b')).toBeNull();
    });

    it('refuses an SVG that carries HTML labels', async () => {
        const { mermaid } = fakeMermaid('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><foreignObject><div>x</div></foreignObject></svg>');
        setupMermaidWith(mermaid);
        expect(await renderer().render(ctx('flowchart TD'))).toContain('aparte-code-error');
    });

    it('names the image from the diagram\'s own accTitle, else the locale', async () => {
        const { mermaid } = fakeMermaid();
        setupMermaidWith(mermaid);
        const root = document.createElement('div');
        root.innerHTML = '<pre><code class="language-mermaid">flowchart TD\n  accTitle: How a request flows\n  A --> B</code></pre>'
            + '<pre><code class="language-mermaid">flowchart LR\n  C --> D</code></pre>';
        document.body.appendChild(root);
        aparteGlobalConfig.extendLocale({ diagramAlt: 'Diagramme' });
        renderCodeLanguages(root);
        // One drawing at a time: the second waits for the first.
        await vi.waitFor(() => expect(root.querySelectorAll('img')).toHaveLength(2));
        const alts = Array.from(root.querySelectorAll('img')).map((i) => i.alt);
        expect(alts).toEqual(['How a request flows', 'Diagramme']);
    });

    it('draws one diagram at a time', async () => {
        const order: string[] = [];
        let release!: () => void;
        const mermaid: MermaidLike = {
            initialize: () => {},
            parse: () => Promise.resolve(true),
            render: async (_id, text) => {
                order.push(`start ${text}`);
                if (text === 'graph A') await new Promise<void>((r) => { release = r; });
                order.push(`end ${text}`);
                return { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>' };
            },
        };
        setupMermaidWith(mermaid);
        const a = renderer().render(ctx('graph A'));
        const b = renderer().render(ctx('graph B'));
        await flush();
        expect(order).toEqual(['start graph A']);
        release();
        await Promise.all([a, b]);
        expect(order).toEqual(['start graph A', 'end graph A', 'start graph B', 'end graph B']);
    });

    it('leaves inline code alone', () => {
        setupMermaidWith(fakeMermaid().mermaid);
        expect(renderer().render(ctx('A', { display: false }))).toBeNull();
    });
});

describe('a diagram still arriving', () => {
    it('draws only the latest source while a drawing waits its turn', async () => {
        vi.useFakeTimers();
        const { mermaid, rendered } = fakeMermaid();
        setupMermaidWith(mermaid);
        const first = renderer().render(ctx('flowchart TD\n  A', { open: true }));
        const second = renderer().render(ctx('flowchart TD\n  A --> B', { open: true }));
        await vi.runAllTimersAsync();
        expect(await first).toBeNull();
        expect(await second).toContain('aparte-diagram');
        expect(rendered).toEqual(['flowchart TD\n  A --> B']);
    });

    it('keeps its pace: the next drawing waits at least 300 ms', async () => {
        vi.useFakeTimers();
        const { mermaid, rendered } = fakeMermaid();
        setupMermaidWith(mermaid);
        await vi.runAllTimersAsync();
        void renderer().render(ctx('flowchart TD\n  A', { open: true }));
        await vi.advanceTimersByTimeAsync(10);
        expect(rendered).toHaveLength(1);
        void renderer().render(ctx('flowchart TD\n  A --> B', { open: true }));
        await vi.advanceTimersByTimeAsync(100);
        expect(rendered).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(300);
        expect(rendered).toHaveLength(2);
    });

    it('does not draw a source that does not parse yet', async () => {
        vi.useFakeTimers();
        const { mermaid, rendered } = fakeMermaid();
        setupMermaidWith(mermaid);
        const answer = renderer().render(ctx('flowchart TD\n  A --> BAD', { open: true }));
        await vi.runAllTimersAsync();
        expect(await answer).toBeNull();
        expect(rendered).toEqual([]);
    });

    it('waits for the closed fence when progressive drawing is off', () => {
        setupMermaidWith(fakeMermaid().mermaid, { progressive: false });
        expect(renderer().render(ctx('flowchart TD', { open: true }))).toBeNull();
    });
});

describe('the theme', () => {
    it('reads the chat\'s colours through the browser, and tells a dark one apart', async () => {
        // A canvas normalises any colour the browser understands to hex.
        const seen: string[] = [];
        const fake = { _v: '#000000', get fillStyle() { return this._v; }, set fillStyle(v: string) { seen.push(v); this._v = v === 'rgb(10, 10, 10)' ? '#0a0a0a' : '#f0f0f0'; } };
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fake as unknown as CanvasRenderingContext2D);
        // jsdom takes no `var()` at all: stand in for the browser's computed colour. The
        // background is the first token read.
        let reads = 0;
        vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({
            color: reads++ === 0 ? 'rgb(10, 10, 10)' : 'rgb(240, 240, 240)',
        }) as CSSStyleDeclaration);
        const { mermaid, configs } = fakeMermaid();
        setupMermaidWith(mermaid);
        const chat = document.createElement('div');
        document.body.appendChild(chat);
        const host = document.createElement('code');
        chat.appendChild(host);
        await renderer().render({ language: 'mermaid', source: 'flowchart TD', display: true, open: false, host, config: aparteGlobalConfig });
        const vars = configs[0]!['themeVariables'] as Record<string, unknown>;
        expect(vars['background']).toBe('#0a0a0a');
        expect(vars['darkMode']).toBe(true);
        // The probe went beside the source, never into it.
        expect(host.childNodes).toHaveLength(0);
    });

    it('is part of what a drawing depends on, and a change draws again', async () => {
        const { mermaid } = fakeMermaid();
        const dispose = setupMermaidWith(mermaid);
        const c = ctx('flowchart TD');
        const before = renderer().cacheKey!(c);
        document.documentElement.setAttribute('data-aparte-theme', 'dark');
        await flush();
        expect(renderer().cacheKey!(c)).not.toBe(before);
        dispose();
        expect(aparteGlobalConfig.hasCodeLanguageRenderer('mermaid')).toBe(false);
    });

    it('loads Mermaid on the first diagram, not before', async () => {
        const load = vi.fn(() => Promise.resolve(fakeMermaid().mermaid));
        setupMermaidWith(load);
        expect(load).not.toHaveBeenCalled();
        await renderer().render(ctx('flowchart TD'));
        expect(load).toHaveBeenCalledTimes(1);
    });
});
