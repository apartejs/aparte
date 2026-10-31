/**
 * The Chart.js renderer, on a stand-in Chart: jsdom has no canvas and no layout, so the
 * real one cannot draw. What is real is the plugin — the config it hands over, the markup
 * around the canvas, the pace it keeps while a fence arrives, when it mounts, fits,
 * re-themes and releases a chart — and core's engine.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { aparteGlobalConfig, renderCodeLanguages, type AparteCodeLanguageContext, type AparteToolCallSegment, type AparteToolRenderer } from '@aparte/core';
import { setupChartjsWith, type ChartjsConstructor } from './core.js';
import { resetScratch } from './theme.js';

/** A Chart that records what it was given, and what was asked of it since. */
class FakeChart {
    static instances: FakeChart[] = [];
    static failWith: string | null = null;
    options: any;
    data: any;
    updates: Array<string | undefined> = [];
    resizes = 0;
    destroyed = false;
    constructor(public canvas: HTMLCanvasElement, public config: any) {
        if (FakeChart.failWith) throw new Error(FakeChart.failWith);
        this.options = config.options;
        this.data = config.data;
        FakeChart.instances.push(this);
    }
    update(mode?: string): void { this.updates.push(mode); }
    resize(): void { this.resizes++; }
    destroy(): void { this.destroyed = true; }
}
const Chart = FakeChart as unknown as ChartjsConstructor;
const live = (): FakeChart[] => FakeChart.instances.filter((c) => !c.destroyed);

/** A ResizeObserver the test drives: `fire(el, w, h)` reports a size for an observed element. */
class FakeResizeObserver {
    static all: FakeResizeObserver[] = [];
    observed = new Set<Element>();
    constructor(private callback: ResizeObserverCallback) { FakeResizeObserver.all.push(this); }
    observe(el: Element): void { this.observed.add(el); }
    unobserve(el: Element): void { this.observed.delete(el); }
    disconnect(): void { this.observed.clear(); }
    /** One callback reporting a size for each of `els`, as a browser batches them. */
    callbackFor(els: Element[], width: number, height: number): void {
        this.callback(els.map((target) => ({ target, contentRect: { width, height } }) as unknown as ResizeObserverEntry), this as unknown as ResizeObserver);
    }
    static fire(el: Element, width: number, height: number): void {
        for (const ro of FakeResizeObserver.all) {
            if (ro.observed.has(el)) ro.callback([{ target: el, contentRect: { width, height } } as unknown as ResizeObserverEntry], ro as unknown as ResizeObserver);
        }
    }
}

let reduced = false;
const BAR = { type: 'bar', data: { labels: ['Jan', 'Feb'], datasets: [{ label: 'Sales', data: [3, 5] }] } };
const json = (value: unknown = BAR): string => JSON.stringify(value);
const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const renderer = () => aparteGlobalConfig.getCodeLanguageRenderer('chartjs')!;

function ctx(source: string, over: Partial<AparteCodeLanguageContext> = {}): AparteCodeLanguageContext {
    const host = document.createElement('code');
    document.body.appendChild(host);
    return { language: 'chartjs', source, display: true, open: false, host, config: aparteGlobalConfig, ...over };
}

/** A reply with one fence, drawn by core's engine. */
async function drawFence(source = json(), language = 'chartjs'): Promise<HTMLElement> {
    const root = document.createElement('div');
    root.innerHTML = `<pre><code class="language-${language}"></code></pre>`;
    root.querySelector('code')!.textContent = source;
    document.body.appendChild(root);
    renderCodeLanguages(root);
    await flush();
    return root;
}

beforeEach(() => {
    FakeChart.instances = [];
    FakeChart.failWith = null;
    FakeResizeObserver.all = [];
    reduced = false;
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('reduced-motion') ? reduced : false,
        addEventListener: () => {},
        removeEventListener: () => {},
    }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    resetScratch();
});

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
    document.head.querySelectorAll('style[data-aparte-chartjs-styles]').forEach((s) => s.remove());
    document.documentElement.removeAttribute('data-aparte-theme');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('a fence', () => {
    it('is drawn on a canvas, sized by the plugin rather than by Chart.js', async () => {
        setupChartjsWith(Chart);
        const root = await drawFence();
        expect(live()).toHaveLength(1);
        const chart = live()[0]!;
        expect(root.querySelector('.aparte-code-drawing canvas')).toBe(chart.canvas);
        expect(chart.config.options).toMatchObject({ responsive: false, maintainAspectRatio: false });
        expect(chart.resizes).toBe(1);
        expect(chart.config.plugins).toBeUndefined();
        // Its frame is watched for its size.
        expect(FakeResizeObserver.all[0]!.observed.has(chart.canvas.parentElement!)).toBe(true);
        expect(document.head.querySelector('style[data-aparte-chartjs-styles]')).not.toBeNull();
    });

    it('is drawn under both names', async () => {
        setupChartjsWith(Chart);
        await drawFence(json(), 'chart.js');
        expect(live()).toHaveLength(1);
        expect(aparteGlobalConfig.hasCodeLanguageRenderer('chart.js')).toBe(true);
    });

    it('is named by its title, else "Chart" in the chat\'s language, and carries its data as a table', async () => {
        setupChartjsWith(Chart);
        const titled = await drawFence(json({ ...BAR, options: { plugins: { title: { display: true, text: 'Sales by month' } } } }));
        expect(titled.querySelector('canvas')!.getAttribute('role')).toBe('img');
        // A figure named like the canvas, holding it and its table — as an ECharts chart is.
        const figure = titled.querySelector('.aparte-chartjs')!;
        expect(figure.getAttribute('role')).toBe('figure');
        expect(figure.getAttribute('aria-label')).toBe('Sales by month');
        expect(figure.querySelector('canvas')).not.toBeNull();
        expect(figure.querySelector('table')).not.toBeNull();
        expect(titled.querySelector('canvas')!.getAttribute('aria-label')).toBe('Sales by month');
        expect(titled.querySelector('.aparte-sr-only caption')!.textContent).toBe('Sales by month');
        expect(titled.querySelector('canvas')!.children).toHaveLength(0);

        aparteGlobalConfig.setLocale({ ...aparteGlobalConfig.getLocale(), tag: 'fr' });
        const plain = await drawFence(json({ type: 'line', data: { labels: ['a'], datasets: [{ data: [1] }] } }));
        expect(plain.querySelector('canvas')!.getAttribute('aria-label')).toBe('Graphique');
        expect(plain.querySelector('thead th[data-aparte-chartjs-series]')!.textContent).toBe('Série 1');
        expect(plain.querySelector('tbody tr')!.textContent).toBe('a1');
    });

    it('follows the app\'s own words', async () => {
        setupChartjsWith(Chart);
        aparteGlobalConfig.extendLocale({ chartjsChart: 'Figure' });
        const root = await drawFence(json({ type: 'line', data: { datasets: [{ data: [1] }] } }));
        expect(root.querySelector('canvas')!.getAttribute('aria-label')).toBe('Figure');
    });

    it('shows a note and its source when it is not a chart once closed', async () => {
        setupChartjsWith(Chart);
        const root = await drawFence('{"type": "bar", "data": <b>oops</b>');
        expect(root.querySelector('[data-aparte-chartjs-error]')!.textContent).toBe('This chart could not be drawn.');
        expect(root.querySelector('pre.aparte-code-error')!.textContent).toContain('<b>oops</b>');
        expect(root.querySelector('.aparte-code-drawing b')).toBeNull();
        expect(live()).toHaveLength(0);
    });

    it('shows the note when Chart.js refuses the config, and says why once', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        FakeChart.failWith = '"pie" is not a registered controller.';
        setupChartjsWith(Chart);
        const root = await drawFence(json({ ...BAR, type: 'pie' }));
        expect(root.querySelector('[data-aparte-chartjs-error]')!.textContent).toBe('This chart could not be drawn.');
        expect(root.querySelector('canvas')).toBeNull();
        expect(root.querySelector('.aparte-chartjs')!.hasAttribute('data-aparte-chartjs-failed')).toBe(true);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('carries the height the app asked for, and a config\'s own aspect ratio', async () => {
        setupChartjsWith(Chart, { height: '24rem' });
        const root = await drawFence(json({ ...BAR, options: { aspectRatio: 2 } }));
        const wrapper = root.querySelector<HTMLElement>('.aparte-chartjs')!;
        expect(wrapper.style.getPropertyValue('--aparte-chartjs-height')).toBe('24rem');
        expect(wrapper.hasAttribute('data-aparte-chartjs-ratio')).toBe(true);
        expect(live()[0]!.config.options.maintainAspectRatio).toBe(true);
    });

    it('is left at its own size when its config says it is not responsive', async () => {
        setupChartjsWith(Chart);
        const root = await drawFence(json({ ...BAR, options: { responsive: false } }));
        const chart = live()[0]!;
        expect(chart.resizes).toBe(0);
        FakeResizeObserver.fire(root.querySelector('.aparte-chartjs__frame')!, 300, 200);
        expect(chart.resizes).toBe(0);
    });

    it('leaves inline code alone', () => {
        setupChartjsWith(Chart);
        expect(renderer().render(ctx(json(), { display: false }))).toBeNull();
    });

    it('loads Chart.js on the first chart, not before, from a module carrying it', async () => {
        const load = vi.fn(() => Promise.resolve({ Chart }));
        setupChartjsWith(load);
        expect(load).not.toHaveBeenCalled();
        await drawFence();
        expect(load).toHaveBeenCalledTimes(1);
        expect(live()).toHaveLength(1);
    });

    it('tries a failed load again on the next chart', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        let calls = 0;
        setupChartjsWith(() => (++calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ default: Chart })));
        await expect(renderer().render(ctx(json()))).rejects.toThrow('offline');
        expect(await renderer().render(ctx(json()))).toContain('aparte-chartjs');
        await expect((async () => {
            setupChartjsWith(() => Promise.resolve({}) as never);
            return renderer().render(ctx(json()));
        })()).rejects.toThrow('no Chart class');
    });
});

describe('the theme', () => {
    it('draws in the chat\'s colours, and follows a switch in place', async () => {
        let colour = 'rgb(10, 10, 10)';
        const real = window.getComputedStyle.bind(window);
        vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
            const style = real(el);
            return new Proxy(style, { get: (t, k) => (k === 'color' ? colour : k === 'fontFamily' ? 'Inter' : Reflect.get(t, k)) });
        });
        setupChartjsWith(Chart);
        await drawFence();
        const chart = live()[0]!;
        expect(chart.config.options.color).toBe('rgb(10, 10, 10)');
        expect(chart.config.options.font.family).toBe('Inter');

        colour = 'rgb(240, 240, 240)';
        document.documentElement.setAttribute('data-aparte-theme', 'dark');
        await vi.waitFor(() => expect(chart.updates).toEqual(['none']));
        expect(chart.options.color).toBe('rgb(240, 240, 240)');
        expect(chart.data.datasets[0].borderColor).toBe('rgb(240, 240, 240)');
        // The same chart, not a new one.
        expect(live()).toEqual([chart]);
    });

    it('re-themes a chart in a shadow root when the theme changes in there', async () => {
        setupChartjsWith(Chart);
        const widget = document.createElement('div');
        document.body.appendChild(widget);
        const shadow = widget.attachShadow({ mode: 'open' });
        const chat = document.createElement('div');
        chat.innerHTML = '<pre><code class="language-chartjs"></code></pre>';
        chat.querySelector('code')!.textContent = json();
        shadow.appendChild(chat);
        renderCodeLanguages(chat);
        await vi.waitFor(() => expect(live()).toHaveLength(1));
        expect(shadow.querySelector('style[data-aparte-chartjs-styles]')).not.toBeNull();
        chat.setAttribute('data-aparte-theme', 'dark');
        await vi.waitFor(() => expect(live()[0]!.updates).toEqual(['none']));
    });
});

describe('motion', () => {
    it('animates a chart that arrives whole, and none under reduced motion', async () => {
        setupChartjsWith(Chart);
        await drawFence();
        expect(live()[0]!.config.options.animation).toBeUndefined();
        reduced = true;
        await drawFence(json({ ...BAR, options: { animation: { duration: 3000 } } }));
        expect(live()[1]!.config.options.animation).toBe(false);
    });
});

describe('motion that never ends', () => {
    it('drops a looping animation even for a reader who has not asked for less motion', async () => {
        setupChartjsWith(Chart);
        await drawFence(json({ ...BAR, options: { animations: { y: { loop: true, duration: 500 } } } }));
        expect(live()[0]!.config.options.animations).toEqual({ y: { duration: 500 } });
    });
});

describe('a table cut short', () => {
    it('says so in its last line, in the chat\'s language', async () => {
        setupChartjsWith(Chart);
        const labels = Array.from({ length: 1000 }, (_, i) => `l${i}`);
        const root = await drawFence(json({ type: 'bar', data: { labels, datasets: Array.from({ length: 100 }, () => ({ data: [1] })) } }));
        expect(root.querySelector('tfoot [data-aparte-chartjs-cut]')!.textContent).toBe('Only part of the data is listed.');
        aparteGlobalConfig.setLocale({ ...aparteGlobalConfig.getLocale(), tag: 'de' });
        renderer().relabel!(root.querySelector<HTMLElement>('.aparte-code-drawing')!, ctx(json()));
        expect(root.querySelector('tfoot [data-aparte-chartjs-cut]')!.textContent).toBe('Nur ein Teil der Daten ist aufgeführt.');
    });
});

describe('size and lifetime', () => {
    it('fits the chart when its frame changes size, and not while it is hidden', async () => {
        setupChartjsWith(Chart);
        const root = await drawFence();
        const chart = live()[0]!;
        const frame = root.querySelector('.aparte-chartjs__frame')!;
        FakeResizeObserver.fire(frame, 400, 288);
        expect(chart.resizes).toBe(2);
        FakeResizeObserver.fire(frame, 0, 0);
        expect(chart.resizes).toBe(2);
    });

    it('releases a chart once it has left the page, not while it is only moved', async () => {
        setupChartjsWith(Chart);
        const root = await drawFence();
        const chart = live()[0]!;
        const frame = root.querySelector('.aparte-chartjs__frame')!;
        // Moved: out and back within the task.
        const parent = root.parentElement!;
        root.remove();
        FakeResizeObserver.fire(frame, 0, 0);
        parent.appendChild(root);
        await new Promise((r) => setTimeout(r, 5));
        expect(chart.destroyed).toBe(false);
        // Gone.
        root.remove();
        FakeResizeObserver.fire(frame, 0, 0);
        await new Promise((r) => setTimeout(r, 5));
        expect(chart.destroyed).toBe(true);
    });

    it('draws a chart again when the message it was in comes back after it was released', async () => {
        setupChartjsWith(Chart);
        const root = await drawFence();
        const frame = root.querySelector('.aparte-chartjs__frame')!;
        const parent = root.parentElement!;
        root.remove();
        FakeResizeObserver.fire(frame, 0, 0);
        await new Promise((r) => setTimeout(r, 5));
        expect(live()).toHaveLength(0);
        // Back (a list that virtualises its messages, a conversation reopened): its frame is
        // still watched, and its first size draws it.
        parent.appendChild(root);
        FakeResizeObserver.fire(frame, 400, 288);
        expect(live()).toHaveLength(1);
        expect(live()[0]!.canvas).toBe(root.querySelector('canvas'));
    });

    it('watches a bounded number of released frames, the oldest let go first', async () => {
        setupChartjsWith(Chart);
        const roots: HTMLElement[] = [];
        for (let i = 0; i < 33; i++) roots.push(await drawFence());
        const frames = roots.map((r) => r.querySelector('.aparte-chartjs__frame')!);
        for (const root of roots) root.remove();
        FakeResizeObserver.fire(frames[0]!, 0, 0);
        await new Promise((r) => setTimeout(r, 5));
        expect(live()).toHaveLength(0);
        const observed = FakeResizeObserver.all[0]!.observed;
        expect(observed.has(frames[0]!)).toBe(false);
        expect(frames.slice(1).every((f) => observed.has(f))).toBe(true);
    });

    it('stops watching a frame it released for good', async () => {
        const dispose = setupChartjsWith(Chart, { tool: 'plot' });
        const element = aparteGlobalConfig.getToolRenderer('plot')!.render({ type: 'tool_call', id: 's', status: 'resolved', toolCall: { id: 'c', name: 'plot', input: {} }, structuredResult: BAR } as AparteToolCallSegment) as HTMLElement;
        document.body.appendChild(element);
        aparteGlobalConfig.getToolRenderer('plot')!.setup!(element, {} as AparteToolCallSegment);
        const frame = element.querySelector('.aparte-chartjs__frame')!;
        expect(FakeResizeObserver.all[0]!.observed.has(frame)).toBe(true);
        aparteGlobalConfig.getToolRenderer('plot')!.cleanup!(element, {} as AparteToolCallSegment);
        expect(FakeResizeObserver.all[0]!.observed.has(frame)).toBe(false);
        dispose();
    });

    it('keeps fitting and re-theming the other charts when one throws', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        setupChartjsWith(Chart);
        const first = await drawFence();
        const second = await drawFence();
        const [a, b] = live();
        a!.resize = () => { throw new Error('resize'); };
        a!.update = () => { throw new Error('update'); };
        FakeResizeObserver.all[0]!.callbackFor([first.querySelector('.aparte-chartjs__frame')!, second.querySelector('.aparte-chartjs__frame')!], 400, 288);
        expect(b!.resizes).toBe(2);
        expect(first.querySelector('[data-aparte-chartjs-error]')).not.toBeNull();
        expect(a!.destroyed).toBe(true);
        document.documentElement.setAttribute('data-aparte-theme', 'dark');
        await vi.waitFor(() => expect(b!.updates).toEqual(['none']));
    });

    it('keeps re-theming the other charts when one throws on its update', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        setupChartjsWith(Chart);
        const first = await drawFence();
        await drawFence();
        const [a, b] = live();
        a!.update = () => { throw new Error('update'); };
        document.documentElement.setAttribute('data-aparte-theme', 'dark');
        await vi.waitFor(() => expect(b!.updates).toEqual(['none']));
        expect(first.querySelector('[data-aparte-chartjs-error]')).not.toBeNull();
        expect(a!.destroyed).toBe(true);
    });

    it('mounts a chart drawn off the page once its frame shows', async () => {
        setupChartjsWith(Chart);
        const drawing = document.createElement('span');
        const html = await renderer().render(ctx(json()));
        drawing.innerHTML = html!;
        renderer().relabel!(drawing, ctx(json()));
        expect(live()).toHaveLength(0);
        document.body.appendChild(drawing);
        FakeResizeObserver.fire(drawing.querySelector('.aparte-chartjs__frame')!, 400, 288);
        expect(live()).toHaveLength(1);
    });

    it('relabels a chart without drawing a second one on it', async () => {
        setupChartjsWith(Chart);
        const root = await drawFence();
        const drawing = root.querySelector<HTMLElement>('.aparte-code-drawing')!;
        aparteGlobalConfig.setLocale({ ...aparteGlobalConfig.getLocale(), tag: 'de' });
        renderer().relabel!(drawing, ctx(json()));
        expect(live()).toHaveLength(1);
        expect(drawing.querySelector('canvas')!.getAttribute('aria-label')).toBe('Diagramm');
    });

    it('releases every chart, and stops watching, when disposed', async () => {
        const dispose = setupChartjsWith(Chart);
        await drawFence();
        await drawFence();
        expect(live()).toHaveLength(2);
        dispose();
        expect(live()).toHaveLength(0);
        expect(aparteGlobalConfig.hasCodeLanguageRenderer('chartjs')).toBe(false);
        document.documentElement.setAttribute('data-aparte-theme', 'dark');
        await flush();
        expect(FakeChart.instances.every((c) => c.updates.length === 0)).toBe(true);
    });
});

describe('a fence still arriving', () => {
    const partial = (points: string): string => `{"type":"bar","data":{"labels":["a","b","c"],"datasets":[{"data":[${points}`;

    it('shows a quiet box the chart\'s size on its first frame, in place of its JSON', () => {
        const load = vi.fn(() => Promise.resolve(Chart));
        setupChartjsWith(load);
        const html = renderer().render(ctx(partial('1'), { open: true }));
        expect(html).toContain('aparte-skeleton');
        expect(html).toContain('aparte-chartjs__frame');
        // Chart.js is on its way meanwhile.
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('draws the part that has arrived, the latest while a drawing waits its turn', async () => {
        vi.useFakeTimers();
        setupChartjsWith(Chart);
        renderer().render(ctx(partial(''), { open: true }));
        const first = renderer().render(ctx(partial('1, 2'), { open: true }));
        const second = renderer().render(ctx(partial('1, 2, 3'), { open: true }));
        await vi.runAllTimersAsync();
        expect(await first).toBeNull();
        const html = await second;
        // `3` may be the start of `30`: only what a comma has closed is drawn.
        const el = document.createElement('div');
        el.innerHTML = html!;
        const config = JSON.parse(el.querySelector('.aparte-chartjs')!.getAttribute('data-aparte-chartjs-config')!);
        expect(config.data.datasets[0].data).toEqual([1, 2]);
        expect(el.querySelector('.aparte-chartjs')!.hasAttribute('data-aparte-chartjs-open')).toBe(true);
    });

    it('keeps its pace: the next drawing waits at least 300 ms', async () => {
        vi.useFakeTimers();
        setupChartjsWith(Chart);
        await vi.runAllTimersAsync();
        renderer().render(ctx(partial(''), { open: true }));
        const a = renderer().render(ctx(partial('1,'), { open: true }));
        await vi.advanceTimersByTimeAsync(10);
        expect(await a).toContain('aparte-chartjs');
        const b = renderer().render(ctx(partial('1, 2,'), { open: true }));
        let settled = false;
        void Promise.resolve(b).then(() => { settled = true; });
        await vi.advanceTimersByTimeAsync(100);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(300);
        expect(await b).toContain('aparte-chartjs');
    });

    it('draws nothing new for a token that changes nothing drawable, or before a point has arrived', async () => {
        vi.useFakeTimers();
        setupChartjsWith(Chart);
        const head = '{"type":"bar","data":{"datasets":[{"data":[';
        renderer().render(ctx(head, { open: true }));
        const none = renderer().render(ctx(`${head}1`, { open: true }));
        await vi.runAllTimersAsync();
        expect(await none).toBeNull();
        const a = renderer().render(ctx(`${head}1,`, { open: true }));
        await vi.runAllTimersAsync();
        expect(await a).toContain('aparte-chartjs');
        const same = renderer().render(ctx(`${head}1, 2`, { open: true }));
        await vi.runAllTimersAsync();
        expect(await same).toBeNull();
    });

    it('settles into a chart that does not replay an entrance after the reader watched it grow', async () => {
        vi.useFakeTimers();
        setupChartjsWith(Chart);
        const c = ctx(partial(''), { open: true });
        renderer().render(c);
        const waiting = renderer().render({ ...c, source: partial('1,') });
        const closed = await renderer().render({ ...c, source: `${partial('1, 2]}]}')}}`, open: false });
        expect(await waiting).toBeNull();
        expect(closed).toContain('data-aparte-chartjs-still');
    });

    it('animates nothing while it streams, and draws each frame as a new chart', async () => {
        setupChartjsWith(Chart);
        const root = document.createElement('div');
        root.innerHTML = '<pre><code class="language-chartjs"></code></pre>';
        const code = root.querySelector('code')!;
        document.body.appendChild(root);
        code.textContent = partial('');
        renderCodeLanguages(root, { streaming: true });
        code.textContent = partial('1, 2,');
        renderCodeLanguages(root, { streaming: true });
        await vi.waitFor(() => expect(live()).toHaveLength(1), { timeout: 2000 });
        expect(live()[0]!.config.options.animation).toBe(false);
        code.textContent = `${partial('1, 2, 3]}]}')}}`;
        renderCodeLanguages(root);
        await vi.waitFor(() => expect(live().map((c) => c.config.data.datasets[0].data)).toEqual([[1, 2, 3]]), { timeout: 2000 });
        expect(live()[0]!.config.options.animation).toBe(false);
    });

    it('waits for the closed fence when progressive drawing is off', () => {
        setupChartjsWith(Chart, { progressive: false });
        expect(renderer().render(ctx(partial('1'), { open: true }))).toBeNull();
    });
});

describe('a tool', () => {
    const segment = (over: Partial<AparteToolCallSegment> = {}): AparteToolCallSegment => ({
        type: 'tool_call', id: 's1', status: 'resolved',
        toolCall: { id: 'c1', name: 'plot', input: { metric: 'sales' } },
        ...over,
    } as AparteToolCallSegment);
    const tool = (): AparteToolRenderer => aparteGlobalConfig.getToolRenderer('plot')!;
    const mountTool = (s: AparteToolCallSegment): HTMLElement => {
        const element = tool().render(s) as HTMLElement;
        document.body.appendChild(element);
        tool().setup!(element, s);
        return element;
    };

    it('draws the chart its result is, in place of its row', () => {
        setupChartjsWith(Chart, { tool: 'plot' });
        const element = mountTool(segment({ structuredResult: BAR }));
        expect(element.className).toBe('aparte-chartjs-tool');
        expect(live()).toHaveLength(1);
        expect(live()[0]!.canvas.getAttribute('aria-label')).toBe('Chart');
    });

    it('reads a text result as JSON, and draws a tool\'s own data through `map`', () => {
        const map = vi.fn((result: unknown, input: Record<string, unknown>) => ({
            type: 'line', data: { labels: (result as { x: string[] }).x, datasets: [{ label: String(input['metric']), data: (result as { y: number[] }).y }] },
        }));
        setupChartjsWith(Chart, { tool: [/^plot/], map });
        mountTool(segment({ result: JSON.stringify({ x: ['a'], y: [4] }) }));
        expect(map).toHaveBeenCalledWith({ x: ['a'], y: [4] }, { metric: 'sales' });
        expect(live()[0]!.config.data.datasets[0].label).toBe('sales');
    });

    it('shows a quiet box while it runs, then the chart in the same element', () => {
        setupChartjsWith(Chart, { tool: 'plot' });
        const element = mountTool(segment({ status: 'pending' }));
        expect(element.querySelector('.aparte-skeleton')).not.toBeNull();
        expect(element.getAttribute('aria-busy')).toBe('true');
        tool().update!(element, segment({ structuredResult: BAR }));
        expect(element.querySelector('.aparte-skeleton')).toBeNull();
        expect(element.hasAttribute('aria-busy')).toBe(false);
        expect(live()).toHaveLength(1);
        // The same result again keeps the chart on screen.
        tool().update!(element, segment({ structuredResult: BAR }));
        expect(FakeChart.instances).toHaveLength(1);
    });

    it.each([
        ['rejected', 'Chart not available', '[data-aparte-chartjs-unavailable]'],
        ['failed', 'Chart not available', '[data-aparte-chartjs-unavailable]'],
        ['awaiting-approval', 'Waiting', '[data-aparte-chartjs-waiting]'],
    ] as const)('says in one line that a %s call has no chart', (status, text, selector) => {
        setupChartjsWith(Chart, { tool: 'plot' });
        const element = mountTool(segment({ status }));
        expect(element.querySelector(selector)!.textContent).toBe(text);
        aparteGlobalConfig.extendLocale({ chartjsUnavailable: 'Pas de graphique', approvalWaiting: 'En attente' });
        tool().relabel!(element, segment({ status }));
        expect(element.querySelector(selector)!.textContent).toBe(status === 'awaiting-approval' ? 'En attente' : 'Pas de graphique');
    });

    it('says the chart could not be drawn when the result is not one, or `map` throws', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        setupChartjsWith(Chart, { tool: 'plot', map: (r) => { if (r === 'boom') throw new Error('boom'); return r; } });
        expect(mountTool(segment({ result: 'not json' })).querySelector('[data-aparte-chartjs-error]')!.textContent).toBe('This chart could not be drawn.');
        expect(mountTool(segment({ structuredResult: 'boom' })).querySelector('[data-aparte-chartjs-error]')).not.toBeNull();
        expect(mountTool(segment({ result: undefined })).querySelector('[data-aparte-chartjs-error]')).not.toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(live()).toHaveLength(0);
    });

    it('releases its chart when core lets the element go, and is unregistered by the disposer', () => {
        const dispose = setupChartjsWith(Chart, { tool: 'plot' });
        const element = mountTool(segment({ structuredResult: BAR }));
        tool().cleanup!(element, segment());
        expect(live()).toHaveLength(0);
        dispose();
        expect(aparteGlobalConfig.getToolRenderer('plot')).toBeUndefined();
    });

    it('mounts a chart whose Chart.js is still loading once it has arrived', async () => {
        let resolve!: (c: ChartjsConstructor) => void;
        setupChartjsWith(() => new Promise<ChartjsConstructor>((r) => { resolve = r; }), { tool: 'plot' });
        mountTool(segment({ structuredResult: BAR }));
        expect(live()).toHaveLength(0);
        resolve(Chart);
        await flush();
        expect(live()).toHaveLength(1);
    });
});
