// @vitest-environment jsdom
/**
 * The code-language engine: a renderer registered for a language draws every
 * placeholder in it, beside the placeholder and never inside it.
 *
 * The renderers here are fakes — the real ones (KaTeX, Mermaid) are plugins, and core
 * cannot import them. What is real is the engine, the registry and the DOM.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderCodeLanguages, unrenderCodeLanguages, relabelCodeLanguages } from '../code-languages.js';
import { aparteGlobalConfig } from '../../config/index.js';
import type { AparteCodeLanguageContext, AparteCodeLanguageRenderer } from '../../config/aparte-config.js';

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

function root(html: string): HTMLElement {
    const el = document.createElement('div');
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
}

/** A renderer that draws `<b>source</b>` and records what it was asked. */
function fake(overrides: Partial<AparteCodeLanguageRenderer> = {}) {
    const calls: AparteCodeLanguageContext[] = [];
    const renderer: AparteCodeLanguageRenderer = {
        languages: ['math'],
        render: (ctx) => { calls.push(ctx); return `<b class="drawn">${ctx.source}</b>`; },
        ...overrides,
    };
    return { renderer, calls };
}

const inline = (tex: string) => `<p>x <code class="language-math math-inline">${tex}</code> y</p>`;
const drawing = (el: Element) => el.querySelector('.aparte-code-drawing');

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('drawing a settled source', () => {
    it('does nothing where no renderer is registered', () => {
        const el = root(inline('a^2'));
        renderCodeLanguages(el);
        expect(drawing(el)).toBeNull();
        expect(el.querySelector('code')!.hidden).toBe(false);
    });

    it('draws beside the placeholder and leaves the placeholder as it was', () => {
        const { renderer, calls } = fake();
        aparteGlobalConfig.registerCodeLanguageRenderer(renderer);
        const el = root(inline('a^2'));
        const code = el.querySelector('code')!;
        renderCodeLanguages(el);

        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({ language: 'math', source: 'a^2', display: false, open: false });
        expect(code.textContent).toBe('a^2');
        expect(code.hidden).toBe(true);
        expect(code.nextElementSibling).toBe(drawing(el));
        expect(drawing(el)!.innerHTML).toBe('<b class="drawn">a^2</b>');
        // Inside the paragraph: never at the top level of the rendered Markdown.
        expect(drawing(el)!.parentElement!.tagName).toBe('P');
    });

    it('draws a block inside its <pre>', () => {
        const { renderer, calls } = fake({ languages: ['mermaid'] });
        aparteGlobalConfig.registerCodeLanguageRenderer(renderer);
        const el = root('<pre><code class="language-mermaid">flowchart TD</code></pre>');
        renderCodeLanguages(el);

        const pre = el.querySelector('pre')!;
        expect(calls[0]!.display).toBe(true);
        expect(drawing(el)!.parentElement).toBe(pre);
        expect(pre.hasAttribute('data-aparte-drawn')).toBe(true);
        expect(el.children).toHaveLength(1);
    });

    it('reads a display formula outside a <pre> as a block', () => {
        const { renderer, calls } = fake();
        aparteGlobalConfig.registerCodeLanguageRenderer(renderer);
        renderCodeLanguages(root('<p><code class="language-math math-display">x</code></p>'));
        expect(calls[0]!.display).toBe(true);
    });

    it('inserts what the renderer returns without sanitizing it', () => {
        aparteGlobalConfig.registerCodeLanguageRenderer({
            languages: ['math'],
            render: () => '<math><mi>x</mi></math><svg viewBox="0 0 1 1"><path d="M0 0"/></svg><span style="vertical-align:-0.25em">x</span>',
        });
        const el = root(inline('x'));
        renderCodeLanguages(el);
        expect(el.querySelector('math')).not.toBeNull();
        expect(el.querySelector('svg path')).not.toBeNull();
        expect(el.querySelector<HTMLElement>('span[style]')!.style.verticalAlign).toBe('-0.25em');
    });

    it('draws a source once, and a new placeholder for it from the cache', () => {
        const { renderer, calls } = fake();
        aparteGlobalConfig.registerCodeLanguageRenderer(renderer);
        const el = root(inline('a^2'));
        renderCodeLanguages(el);
        renderCodeLanguages(el);
        expect(calls).toHaveLength(1);

        // The one-shot path rebuilds every placeholder on every token.
        el.innerHTML = inline('a^2');
        renderCodeLanguages(el);
        expect(calls).toHaveLength(1);
        expect(drawing(el)!.textContent).toBe('a^2');
    });

    it('moves the drawn nodes to a rebuilt placeholder rather than making new ones', () => {
        aparteGlobalConfig.registerCodeLanguageRenderer({ languages: ['mermaid'], render: () => '<img alt="Diagram" src="data:image/svg+xml,x">' });
        const el = root('<pre><code class="language-mermaid">A</code></pre>');
        renderCodeLanguages(el);
        const img = el.querySelector('img');

        el.innerHTML = '<pre><code class="language-mermaid">A</code></pre>';
        renderCodeLanguages(el);
        expect(el.querySelector('img')).toBe(img);
    });

    it('shows the source when the renderer declines it or throws, and warns once', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        aparteGlobalConfig.registerCodeLanguageRenderer({ languages: ['math'], render: () => { throw new Error('bad'); } });
        const el = root(inline('a') + inline('b'));
        renderCodeLanguages(el);
        expect(drawing(el)).toBeNull();
        expect(Array.from(el.querySelectorAll('code')).every((c) => !c.hidden)).toBe(true);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('takes the drawing away when its renderer is removed', () => {
        const { renderer } = fake();
        const remove = aparteGlobalConfig.registerCodeLanguageRenderer(renderer);
        const el = root(inline('a'));
        renderCodeLanguages(el);
        remove();
        renderCodeLanguages(el);
        expect(drawing(el)).toBeNull();
        expect(el.querySelector('code')!.hidden).toBe(false);
    });

    it('leaves a language it was not given alone', () => {
        const { renderer, calls } = fake();
        aparteGlobalConfig.registerCodeLanguageRenderer(renderer);
        renderCodeLanguages(root('<pre><code class="language-ts">const a</code></pre>'));
        expect(calls).toHaveLength(0);
    });
});

describe('a drawing that arrives later', () => {
    it('lands in the placeholder that holds its source by then', async () => {
        let resolve!: (html: string) => void;
        aparteGlobalConfig.registerCodeLanguageRenderer({
            languages: ['mermaid'],
            render: () => new Promise<string>((res) => { resolve = res; }),
        });
        const el = root('<pre><code class="language-mermaid">A</code></pre>');
        renderCodeLanguages(el);
        expect(drawing(el)).toBeNull();

        // Rebuilt while the render was running: the first placeholder is gone.
        el.innerHTML = '<pre><code class="language-mermaid">A</code></pre>';
        renderCodeLanguages(el);
        resolve('<img alt="d">');
        await flush();
        expect(el.querySelector('img')).not.toBeNull();
    });

    it('asks once for a source two placeholders share', async () => {
        const render = vi.fn(() => Promise.resolve('<i>d</i>'));
        aparteGlobalConfig.registerCodeLanguageRenderer({ languages: ['mermaid'], render });
        const el = root('<pre><code class="language-mermaid">A</code></pre><pre><code class="language-mermaid">A</code></pre>');
        renderCodeLanguages(el);
        await flush();
        expect(render).toHaveBeenCalledTimes(1);
        expect(el.querySelectorAll('.aparte-code-drawing')).toHaveLength(2);
    });

    it('keeps the old drawing on screen while a refresh draws the new one', async () => {
        let theme = 'light';
        let resolve!: (html: string) => void;
        aparteGlobalConfig.registerCodeLanguageRenderer({
            languages: ['mermaid'],
            cacheKey: () => theme,
            render: () => theme === 'light' ? '<i>light</i>' : new Promise<string>((res) => { resolve = res; }),
        });
        const el = root('<pre><code class="language-mermaid">A</code></pre>');
        renderCodeLanguages(el);
        theme = 'dark';
        renderCodeLanguages(document.body, { refresh: true, language: 'mermaid' });
        expect(drawing(el)!.textContent).toBe('light');
        resolve('<i>dark</i>');
        await flush();
        expect(drawing(el)!.textContent).toBe('dark');
    });
});

describe('a source still arriving', () => {
    it('treats the last placeholder as open while the content streams', () => {
        const { renderer, calls } = fake();
        aparteGlobalConfig.registerCodeLanguageRenderer(renderer);
        renderCodeLanguages(root(inline('a') + inline('b')), { streaming: true });
        expect(calls.map((c) => [c.source, c.open])).toEqual([['a', false], ['b', true]]);
    });

    it('treats a placeholder its provider marked as open', () => {
        const { renderer, calls } = fake();
        aparteGlobalConfig.registerCodeLanguageRenderer(renderer);
        renderCodeLanguages(root('<p><code class="language-math math-inline" data-aparte-open>a</code> then <code class="language-math math-inline">b</code></p>'), { streaming: true });
        expect(calls.map((c) => c.open)).toEqual([true, true]);
    });

    it('closes everything once the content settles, marker or not', () => {
        const { renderer, calls } = fake();
        aparteGlobalConfig.registerCodeLanguageRenderer(renderer);
        renderCodeLanguages(root('<p><code class="language-math math-inline" data-aparte-open>a</code></p>'), { streaming: false });
        expect(calls[0]!.open).toBe(false);
    });

    it('keeps the last drawing while the next source cannot be drawn yet', () => {
        aparteGlobalConfig.registerCodeLanguageRenderer({
            languages: ['math'],
            render: ({ source }) => source.endsWith('{') ? null : `<b>${source}</b>`,
        });
        const el = root(inline('\\frac'));
        renderCodeLanguages(el, { streaming: true });
        expect(drawing(el)!.textContent).toBe('\\frac');

        // The incremental provider wrote the next token into the same placeholder.
        el.querySelector('code')!.textContent = '\\frac{';
        renderCodeLanguages(el, { streaming: true });
        expect(drawing(el)!.textContent).toBe('\\frac');
    });

    it('carries the last drawing across a rebuilt placeholder, if the source extends it', () => {
        aparteGlobalConfig.registerCodeLanguageRenderer({
            languages: ['math'],
            render: ({ source }) => source.endsWith('{') ? null : `<b>${source}</b>`,
        });
        const el = root(inline('x+1'));
        renderCodeLanguages(el, { streaming: true });
        const drawn = el.querySelector('b');

        el.innerHTML = inline('x+1{');
        renderCodeLanguages(el, { streaming: true });
        expect(el.querySelector('b')).toBe(drawn);

        // Another formula at that position: it does not start with the drawn source.
        el.innerHTML = inline('y{');
        renderCodeLanguages(el, { streaming: true });
        expect(drawing(el)).toBeNull();
        expect(el.querySelector('code')!.classList.contains('aparte-code-pending')).toBe(true);
    });

    it('does not ask again for a source it was already asked for', () => {
        const { renderer, calls } = fake({ render: (ctx) => { calls.push(ctx); return null; } });
        aparteGlobalConfig.registerCodeLanguageRenderer(renderer);
        const el = root(inline('a'));
        renderCodeLanguages(el, { streaming: true });
        renderCodeLanguages(el, { streaming: true });
        expect(calls).toHaveLength(1);
    });

    it('does not let a late answer for an older source replace a newer drawing', async () => {
        const resolvers = new Map<string, (html: string) => void>();
        aparteGlobalConfig.registerCodeLanguageRenderer({
            languages: ['mermaid'],
            render: ({ source }) => new Promise<string>((res) => { resolvers.set(source, res); }),
        });
        const el = root('<pre><code class="language-mermaid">A</code></pre>');
        renderCodeLanguages(el, { streaming: true });
        el.querySelector('code')!.textContent = 'AB';
        renderCodeLanguages(el, { streaming: true });

        resolvers.get('AB')!('<i>AB</i>');
        await flush();
        resolvers.get('A')!('<i>A</i>');
        await flush();
        expect(drawing(el)!.textContent).toBe('AB');
    });
});

describe('around the drawing', () => {
    it('puts the sources back, and draws them again from the cache', () => {
        const { renderer, calls } = fake();
        aparteGlobalConfig.registerCodeLanguageRenderer(renderer);
        const el = root(inline('a'));
        renderCodeLanguages(el);
        unrenderCodeLanguages(el);
        expect(drawing(el)).toBeNull();
        expect(el.querySelector('code')!.hidden).toBe(false);
        expect(el.querySelector('code')!.getAttribute('style') ?? '').not.toContain('display');

        renderCodeLanguages(el);
        expect(drawing(el)).not.toBeNull();
        expect(calls).toHaveLength(1);
    });

    it('lets a drawing re-read its labels after a fill and on request', () => {
        let label = 'Diagram';
        const relabel = vi.fn((d: HTMLElement) => { d.querySelector('img')!.alt = label; });
        aparteGlobalConfig.registerCodeLanguageRenderer({ languages: ['mermaid'], render: () => '<img>', relabel });
        const el = root('<pre><code class="language-mermaid">A</code></pre>');
        renderCodeLanguages(el);
        expect(el.querySelector('img')!.alt).toBe('Diagram');

        label = 'Diagramme';
        relabelCodeLanguages(el);
        expect(el.querySelector('img')!.alt).toBe('Diagramme');
    });

    it('holds a lazy renderer until its placeholder comes near the screen', () => {
        const observed: Element[] = [];
        let callback!: IntersectionObserverCallback;
        let instance!: IntersectionObserver;
        vi.stubGlobal('IntersectionObserver', class {
            constructor(cb: IntersectionObserverCallback) { callback = cb; instance = this as unknown as IntersectionObserver; }
            observe(el: Element) { observed.push(el); }
            unobserve() { /* nothing to undo */ }
            disconnect() { /* nothing to undo */ }
        });
        const { renderer, calls } = fake({ languages: ['mermaid'], lazy: true });
        aparteGlobalConfig.registerCodeLanguageRenderer(renderer);
        const el = root('<pre><code class="language-mermaid">A</code></pre>');
        renderCodeLanguages(el);
        expect(calls).toHaveLength(0);
        expect(observed).toHaveLength(1);

        callback([{ target: observed[0]!, isIntersecting: true } as unknown as IntersectionObserverEntry], instance);
        expect(calls).toHaveLength(1);
        expect(drawing(el)).not.toBeNull();
        vi.unstubAllGlobals();
    });

    it('draws the final version of a source drawn while it streamed without waiting', () => {
        // Found on screen: a diagram drawn while it streamed hides its source, and its
        // final drawing waited for the observer — which reports only on rendered frames,
        // and was watching that hidden source. It is on screen already: nothing to wait for.
        const observed: Element[] = [];
        vi.stubGlobal('IntersectionObserver', class {
            observe(el: Element) { observed.push(el); }
            unobserve() { /* nothing to undo */ }
            disconnect() { /* nothing to undo */ }
        });
        const { renderer, calls } = fake({ languages: ['mermaid'], lazy: true });
        aparteGlobalConfig.registerCodeLanguageRenderer(renderer);
        const el = root('<pre><code class="language-mermaid">flowchart TD</code></pre>');
        renderCodeLanguages(el, { streaming: true });
        expect(el.querySelector('code')!.hidden).toBe(true);

        el.querySelector('code')!.textContent = 'flowchart TD\n  A --> B';
        renderCodeLanguages(el, { streaming: false });
        expect(observed).toEqual([]);
        expect(calls.map((c) => [c.source, c.open])).toEqual([['flowchart TD', true], ['flowchart TD\n  A --> B', false]]);
        expect(drawing(el)!.textContent).toBe('flowchart TD\n  A --> B');
        vi.unstubAllGlobals();
    });

    it('watches the box the reader sees: the <pre> around a block', () => {
        const observed: Element[] = [];
        vi.stubGlobal('IntersectionObserver', class {
            observe(el: Element) { observed.push(el); }
            unobserve() { /* nothing to undo */ }
            disconnect() { /* nothing to undo */ }
        });
        aparteGlobalConfig.registerCodeLanguageRenderer(fake({ languages: ['mermaid'], lazy: true }).renderer);
        const el = root('<pre><code class="language-mermaid">flowchart TD</code></pre>');
        renderCodeLanguages(el);
        expect(observed).toEqual([el.querySelector('pre')]);
        vi.unstubAllGlobals();
    });

    it('scrolls by what a drawing added above the reader, and never back', async () => {
        let resolve!: (html: string) => void;
        aparteGlobalConfig.registerCodeLanguageRenderer({ languages: ['mermaid'], render: () => new Promise<string>((res) => { resolve = res; }) });
        const scroller = document.createElement('div');
        scroller.style.overflowY = 'auto';
        document.body.appendChild(scroller);
        const el = document.createElement('div');
        el.innerHTML = '<pre><code class="language-mermaid">A</code></pre>';
        scroller.appendChild(el);
        renderCodeLanguages(el);

        // Wholly above what the reader sees, and 120px taller once drawn.
        vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ top: 500 } as DOMRect);
        vi.spyOn(el, 'getBoundingClientRect').mockImplementation(() => ({ bottom: 100, height: el.querySelector('img') ? 160 : 40 } as DOMRect));
        vi.spyOn(scroller, 'scrollTop', 'get').mockReturnValue(0);
        const set = vi.spyOn(scroller, 'scrollTop', 'set');
        resolve('<img>');
        await flush();
        expect(set).toHaveBeenCalledWith(120);
    });
});
