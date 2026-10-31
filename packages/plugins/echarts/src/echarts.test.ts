/**
 * The ECharts plugin, on a stand-in ECharts that records what it was told: jsdom has no
 * layout, so the real one cannot size a chart in it. What is real is the plugin — the
 * option it hands over, the element that owns each chart's lifetime, the pace it keeps
 * while a fence arrives — and core's engine.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { aparteGlobalConfig, renderCodeLanguages, type AparteCodeLanguageContext, type AparteToolCallSegment } from '@aparte/core';
import { setupEChartsWith, type EChartsLike } from './core.js';

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

interface Recorded {
    dom: HTMLElement;
    theme: Record<string, any>;
    opts: Record<string, unknown>;
    options: Array<{ option: Record<string, any>; opts?: { notMerge?: boolean } }>;
    themes: Array<Record<string, any>>;
    resized: number;
    disposed: boolean;
}

/** An ECharts that records every instance and what each was told; `throwOn` makes `setOption` throw for a series type. */
function fakeECharts(throwOn?: string) {
    const instances: Recorded[] = [];
    const echarts: EChartsLike = {
        init(dom, theme, opts) {
            const rec: Recorded = { dom, theme: theme as Record<string, any>, opts: opts ?? {}, options: [], themes: [], resized: 0, disposed: false };
            instances.push(rec);
            return {
                setOption(option, o) {
                    if (throwOn && JSON.stringify(option).includes(throwOn)) throw new Error(`Unknown series ${throwOn}`);
                    rec.options.push({ option: option as Record<string, any>, opts: o });
                },
                setTheme(t) { rec.themes.push(t as Record<string, any>); },
                resize() { rec.resized++; },
                dispose() { rec.disposed = true; },
            };
        },
    };
    return { echarts, instances };
}

const BAR = { title: { text: 'Sales by month' }, xAxis: { type: 'category', data: ['Jan', 'Feb'] }, yAxis: {}, series: [{ name: 'Sales', type: 'bar', data: [120, 200] }] };

/** A reply holding one fence, on the page. */
function reply(source: string, language = 'echarts'): HTMLElement {
    const root = document.createElement('div');
    root.setAttribute('data-segment-id', 's1');
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.className = `language-${language}`;
    code.textContent = source;
    pre.append(code);
    root.append(pre);
    document.body.append(root);
    return root;
}

function ctx(source: string, over: Partial<AparteCodeLanguageContext> = {}): AparteCodeLanguageContext {
    const host = document.createElement('code');
    host.className = 'language-echarts';
    document.body.appendChild(host);
    return { language: 'echarts', source, display: true, open: false, host, config: aparteGlobalConfig, ...over };
}

const renderer = () => aparteGlobalConfig.getCodeLanguageRenderer('echarts')!;

let media: { reduced: boolean; dark: boolean; listeners: Array<() => void> };

beforeEach(() => {
    // jsdom has no canvas; the theme then keeps the browser's computed colours.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    media = { reduced: false, dark: false, listeners: [] };
    vi.stubGlobal('matchMedia', (query: string) => ({
        get matches() { return query.includes('reduced-motion') ? media.reduced : media.dark; },
        addEventListener: (_: string, fn: () => void) => media.listeners.push(fn),
        removeEventListener: (_: string, fn: () => void) => { media.listeners = media.listeners.filter((l) => l !== fn); },
    }));
});

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-aparte-theme');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('a closed fence', () => {
    it('holds a long title to the chart\'s width, cut rather than run off both sides', async () => {
        const { echarts, instances } = fakeECharts();
        setupEChartsWith(echarts);
        // jsdom lays nothing out: the chart's box is given a width.
        vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320);
        const long = { ...BAR, title: { text: 'Thousands of trips, April 2025 – March 2026' } };
        const root = reply(JSON.stringify(long));
        renderCodeLanguages(root);
        await flush();
        const title = instances[0]!.options[0]!.option['title'];
        expect(title.textStyle).toEqual({ width: 288, overflow: 'truncate' });
        // The full title is still the figure's name.
        expect(root.querySelector('aparte-echarts')!.getAttribute('aria-label')).toBe(long.title.text);
        // A title that sets its own width keeps it.
        const own = reply(JSON.stringify({ ...BAR, title: { text: 'x', textStyle: { width: 100, overflow: 'break' } } }));
        renderCodeLanguages(own);
        await flush();
        expect(instances[1]!.options[0]!.option['title'].textStyle).toEqual({ width: 100, overflow: 'break' });
    });

    it('draws its option as an SVG chart in a figure named by its title, with ECharts\' own description on', async () => {
        const { echarts, instances } = fakeECharts();
        setupEChartsWith(echarts);
        const root = reply(JSON.stringify(BAR));
        renderCodeLanguages(root);
        await flush();
        const figure = root.querySelector<HTMLElement>('aparte-echarts')!;
        expect(figure.getAttribute('role')).toBe('figure');
        expect(figure.getAttribute('aria-label')).toBe('Sales by month');
        expect(instances).toHaveLength(1);
        const chart = instances[0]!;
        expect(chart.dom.className).toBe('aparte-echarts-chart');
        expect(chart.dom.style.getPropertyValue('block-size')).toBe('18rem');
        expect(chart.opts).toEqual({ renderer: 'svg', locale: 'EN' });
        expect(chart.options).toHaveLength(1);
        expect(chart.options[0]!.opts).toEqual({ notMerge: true });
        expect(chart.options[0]!.option['aria']).toEqual({ enabled: true, label: { enabled: true } });
        expect(chart.options[0]!.option['series']).toEqual(BAR.series);
        // The skeleton it showed while ECharts loaded is gone.
        expect(chart.dom.querySelector('.aparte-skeleton')).toBeNull();
    });

    it('draws the `echart` alias too, at the height and with the renderer the options say', async () => {
        const { echarts, instances } = fakeECharts();
        setupEChartsWith(echarts, { height: 240, renderer: 'canvas' });
        renderCodeLanguages(reply(JSON.stringify(BAR), 'echart'));
        await flush();
        expect(instances[0]!.opts['renderer']).toBe('canvas');
        expect(instances[0]!.dom.style.getPropertyValue('block-size')).toBe('240px');
    });

    it('keeps a CSS length, and refuses one that is not', async () => {
        const { echarts, instances } = fakeECharts();
        const dispose = setupEChartsWith(echarts, { height: '50vh' });
        renderCodeLanguages(reply(JSON.stringify(BAR)));
        await flush();
        expect(instances[0]!.dom.style.getPropertyValue('block-size')).toBe('50vh');
        dispose();
        setupEChartsWith(echarts, { height: '1px; color: red' });
        renderCodeLanguages(reply(JSON.stringify({ ...BAR, title: { text: 'Other' } })));
        await flush();
        expect(instances.at(-1)!.dom.style.getPropertyValue('block-size')).toBe('18rem');
    });

    it('hands over the option with what a model could steer stripped', async () => {
        const { echarts, instances } = fakeECharts();
        setupEChartsWith(echarts);
        const root = reply(JSON.stringify({
            ...BAR,
            tooltip: { renderMode: 'html', formatter: '<img src=x onerror=alert(1)>' },
            toolbox: { feature: { saveAsImage: {}, dataView: {} } },
            graphic: [{ type: 'image', style: { image: 'https://evil.test/x.png' } }],
        }));
        renderCodeLanguages(root);
        await flush();
        const option = instances[0]!.options[0]!.option;
        expect(option['tooltip']).toEqual({ renderMode: 'richText', formatter: '<img src=x onerror=alert(1)>' });
        expect(option['toolbox']).toEqual({ feature: {} });
        expect(option['graphic']).toEqual([]);
        // Nothing of the option reached the page as markup.
        expect(root.querySelector('img')).toBeNull();
    });

    it('answers a fence that is not an option with a note and its source', async () => {
        setupEChartsWith(fakeECharts().echarts);
        const root = reply('{"series": [<b>oops</b>]');
        renderCodeLanguages(root);
        await flush();
        expect(root.querySelector('[data-aparte-echarts-error]')!.textContent).toBe('This chart could not be drawn.');
        expect(root.querySelector('.aparte-code-drawing pre.aparte-code-error')!.textContent).toBe('{"series": [<b>oops</b>]');
        expect(root.querySelector('.aparte-code-drawing b')).toBeNull();
    });

    it('shows the note in place of a chart ECharts refuses', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { echarts, instances } = fakeECharts('nosuchtype');
        setupEChartsWith(echarts);
        const root = reply(JSON.stringify({ series: [{ type: 'nosuchtype', data: [1] }] }));
        renderCodeLanguages(root);
        await flush();
        expect(root.querySelector('aparte-echarts p.aparte-code-error')!.textContent).toBe('This chart could not be drawn.');
        expect(instances[0]!.disposed).toBe(true);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('shows the note when ECharts cannot be loaded, and tries again on the next chart', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { echarts, instances } = fakeECharts();
        const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(echarts);
        setupEChartsWith(load);
        const first = reply(JSON.stringify(BAR));
        renderCodeLanguages(first);
        await flush();
        expect(first.querySelector('aparte-echarts [role="note"]')).not.toBeNull();
        renderCodeLanguages(reply(JSON.stringify({ ...BAR, title: { text: 'Again' } })));
        await flush();
        expect(load).toHaveBeenCalledTimes(2);
        expect(instances).toHaveLength(1);
    });

    it('leaves inline code alone', () => {
        setupEChartsWith(fakeECharts().echarts);
        expect(renderer().render(ctx('{}', { display: false }))).toBeNull();
    });

    it('loads ECharts on the first chart, not before', async () => {
        const load = vi.fn(() => Promise.resolve(fakeECharts().echarts));
        setupEChartsWith(load);
        expect(load).not.toHaveBeenCalled();
        renderCodeLanguages(reply(JSON.stringify(BAR)));
        await flush();
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('turns animation off for a reader who asked for less motion', async () => {
        media.reduced = true;
        const { echarts, instances } = fakeECharts();
        setupEChartsWith(echarts);
        renderCodeLanguages(reply(JSON.stringify(BAR)));
        await flush();
        expect(instances[0]!.options[0]!.option['animation']).toBe(false);
    });

    it('turns it off everywhere an option can turn it back on', async () => {
        media.reduced = true;
        const { echarts, instances } = fakeECharts();
        setupEChartsWith(echarts);
        renderCodeLanguages(reply(JSON.stringify({
            ...BAR,
            series: [{ type: 'bar', data: [1], animation: true }, { type: 'effectScatter', data: [[1, 1]] }, { type: 'lines', data: [], effect: { show: true } }],
            graphic: { elements: [], animation: true },
            timeline: { autoPlay: true, data: ['a'] },
            baseOption: { animation: true, series: [{ type: 'line', animation: true }] },
            options: [{ series: [{ animation: true }] }],
            media: [{ query: {}, option: { series: [{ animation: true }] } }],
        })));
        await flush();
        const option = instances[0]!.options[0]!.option;
        expect(option['animation']).toBe(false);
        expect(option['series'].map((s: Record<string, unknown>) => s['animation'])).toEqual([false, false, false]);
        expect(option['series'][1]['showEffectOn']).toBe('emphasis');
        expect(option['series'][2]['effect']).toEqual({ show: false });
        expect(option['graphic']['animation']).toBe(false);
        expect(option['timeline']['autoPlay']).toBe(false);
        expect(option['baseOption']['animation']).toBe(false);
        expect(option['baseOption']['series'][0]['animation']).toBe(false);
        expect(option['options'][0]['series'][0]['animation']).toBe(false);
        expect(option['media'][0]['option']['series'][0]['animation']).toBe(false);
    });

    it('answers a fence that is JSON with nothing to draw with the note and its source', async () => {
        const { echarts, instances } = fakeECharts();
        setupEChartsWith(echarts);
        for (const source of ['{}', '{"title": {"text": "Only a title"}}']) {
            const root = reply(source);
            renderCodeLanguages(root);
            await flush();
            expect(root.querySelector('[data-aparte-echarts-error]')!.textContent, source).toBe('This chart could not be drawn.');
            expect(root.querySelector('.aparte-code-drawing pre.aparte-code-error')!.textContent).toBe(source);
        }
        expect(instances).toHaveLength(0);
    });
});

describe('what a screen reader gets', () => {
    it('a hidden table of the numbers, captioned with the chart\'s name', async () => {
        setupEChartsWith(fakeECharts().echarts);
        const root = reply(JSON.stringify(BAR));
        renderCodeLanguages(root);
        await flush();
        const table = root.querySelector('aparte-echarts table')!;
        expect(table.className).toBe('aparte-sr-only aparte-echarts-table');
        expect(table.querySelector('caption')!.textContent).toBe('Sales by month');
        expect(Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual(['', 'Sales']);
        expect(Array.from(table.querySelectorAll('tbody tr')).map((tr) => tr.textContent)).toEqual(['Jan120', 'Feb200']);
        expect(table.querySelector('tbody th')!.getAttribute('scope')).toBe('row');
    });

    it('ECharts\' own description in the plugin\'s settings, whatever the option says', async () => {
        const { echarts, instances } = fakeECharts();
        setupEChartsWith(echarts);
        renderCodeLanguages(reply(JSON.stringify({ ...BAR, aria: { enabled: false, label: { enabled: false, description: 'A chart of nothing.', general: { withTitle: 'x' } }, decal: { show: true } } })));
        await flush();
        expect(instances[0]!.options[0]!.option['aria']).toEqual({ enabled: true, label: { enabled: true }, decal: { show: true } });
    });

    it('says in the table when it lists only part of the data', async () => {
        setupEChartsWith(fakeECharts().echarts);
        const option = { xAxis: { data: Array.from({ length: 1000 }, (_, i) => `c${i}`) }, yAxis: {}, series: Array.from({ length: 500 }, () => ({ type: 'bar', data: [1] })) };
        const root = reply(JSON.stringify(option));
        renderCodeLanguages(root);
        await flush();
        const table = root.querySelector('aparte-echarts table')!;
        expect(table.querySelectorAll('td, th').length).toBeLessThanOrEqual(10002);
        expect(table.querySelector('tfoot')!.textContent).toBe('Only part of the data is listed.');
        aparteGlobalConfig.extendLocale({ tag: 'fr' });
        renderer().relabel!(root.querySelector('.aparte-code-drawing')!, { ...ctx('{}'), config: aparteGlobalConfig });
        expect(table.querySelector('tfoot')!.textContent).toBe('Seule une partie des données est listée.');
        const whole = reply(JSON.stringify(BAR));
        renderCodeLanguages(whole);
        await flush();
        expect(whole.querySelector('aparte-echarts tfoot')).toBeNull();
    });

    it('no table where the shape does not say what the numbers are, and the locale\'s name for an untitled chart', async () => {
        setupEChartsWith(fakeECharts().echarts);
        aparteGlobalConfig.extendLocale({ tag: 'fr' });
        const root = reply(JSON.stringify({ xAxis: {}, yAxis: {}, series: [{ type: 'scatter', data: [[1, 2]] }] }));
        renderCodeLanguages(root);
        await flush();
        const figure = root.querySelector('aparte-echarts')!;
        expect(figure.getAttribute('aria-label')).toBe('Graphique');
        expect(figure.querySelector('table')).toBeNull();
    });

    it('a name the app sets wins over the table, and follows a locale change', async () => {
        const { echarts, instances } = fakeECharts();
        setupEChartsWith(echarts);
        aparteGlobalConfig.extendLocale({ tag: 'de' });
        const root = reply(JSON.stringify({ series: [{ type: 'pie', data: [{ name: 'A', value: 1 }] }] }));
        renderCodeLanguages(root);
        await flush();
        const figure = root.querySelector('aparte-echarts')!;
        expect(figure.getAttribute('aria-label')).toBe('Diagramm');
        expect(instances[0]!.opts['locale']).toBe('DE');
        aparteGlobalConfig.extendLocale({ echartsChart: 'Camembert' });
        renderer().relabel!(root.querySelector('.aparte-code-drawing')!, { ...ctx('{}'), config: aparteGlobalConfig });
        expect(figure.getAttribute('aria-label')).toBe('Camembert');
        expect(figure.querySelector('caption')!.textContent).toBe('Camembert');
    });
});

describe('a fence still arriving', () => {
    it('shows a quiet box on its first frame, in place of its JSON', () => {
        setupEChartsWith(fakeECharts().echarts);
        expect(renderer().render(ctx('{"series": [', { open: true }))).toContain('aparte-echarts-pending');
    });

    it('draws what has arrived, the latest while a drawing waits its turn', async () => {
        vi.useFakeTimers();
        setupEChartsWith(fakeECharts().echarts);
        const c = ctx('{"xAxis": {"data": ["a", "b"]}, ', { open: true });
        renderer().render(c);
        const first = renderer().render({ ...c, source: '{"xAxis": {"data": ["a", "b"]}, "series": [{"type": "bar", "data": [1' });
        const second = renderer().render({ ...c, source: '{"xAxis": {"data": ["a", "b"]}, "series": [{"type": "bar", "data": [1, 2' });
        await vi.runAllTimersAsync();
        expect(await first).toBeNull();
        const html = await second as string;
        const el = document.createElement('div');
        el.innerHTML = html;
        const option = JSON.parse(el.querySelector('aparte-echarts')!.getAttribute('data-aparte-echarts-option')!);
        // `2` is a number still being written: each point appears once the next one starts.
        expect(option.series).toEqual([{ type: 'bar', data: [1] }]);
    });

    it('keeps its pace: the next drawing waits at least 300 ms', async () => {
        vi.useFakeTimers();
        setupEChartsWith(fakeECharts().echarts);
        const c = ctx('{"series": [', { open: true });
        renderer().render(c);
        const a = renderer().render({ ...c, source: '{"series": [{"data": [1, 2' });
        await vi.advanceTimersByTimeAsync(10);
        expect(await a).toContain('aparte-echarts');
        let b: string | null = 'unanswered';
        void (renderer().render({ ...c, source: '{"series": [{"data": [1, 2, 3, ' }) as Promise<string | null>).then((h) => { b = h; });
        await vi.advanceTimersByTimeAsync(100);
        expect(b).toBe('unanswered');
        await vi.advanceTimersByTimeAsync(300);
        expect(b).toContain('aparte-echarts');
    });

    it('does not draw a frame that changes nothing, or has nothing to draw yet', async () => {
        vi.useFakeTimers();
        setupEChartsWith(fakeECharts().echarts);
        const c = ctx('{"title": {"text": "T"}', { open: true });
        renderer().render(c);
        const nothing = renderer().render({ ...c, source: '{"title": {"text": "T"}, "x' });
        await vi.runAllTimersAsync();
        expect(await nothing).toBeNull();
        const drawn = renderer().render({ ...c, source: '{"title": {"text": "T"}, "series": [{"data": [1, 2' });
        await vi.runAllTimersAsync();
        expect(await drawn).toContain('aparte-echarts');
        const same = renderer().render({ ...c, source: '{"title": {"text": "T"}, "series": [{"data": [1, 2' + '  ' });
        await vi.runAllTimersAsync();
        expect(await same).toBeNull();
    });

    it('starts again with a quiet box when another chart takes the position', () => {
        setupEChartsWith(fakeECharts().echarts);
        const c = ctx('{"series": [', { open: true });
        renderer().render(c);
        expect(renderer().render({ ...c, source: '{"title": {' })).toContain('aparte-echarts-pending');
    });

    it('waits for the closed fence when progressive drawing is off', () => {
        setupEChartsWith(fakeECharts().echarts, { progressive: false });
        expect(renderer().render(ctx('{"series": [', { open: true }))).toBeNull();
    });

    it('updates one chart frame after frame, then the closed fence takes it over, in one instance', async () => {
        vi.useFakeTimers();
        const { echarts, instances } = fakeECharts();
        setupEChartsWith(echarts);
        const head = '{"xAxis": {"type": "category", "data": ["a", "b", "c"]}, "yAxis": {}, "series": [{"type": "bar", "data": [';
        const root = reply(head);
        const code = root.querySelector('code')!;
        const pass = async (source: string, streaming = true) => {
            code.textContent = source;
            renderCodeLanguages(root, { streaming });
            await vi.advanceTimersByTimeAsync(400);
            renderCodeLanguages(root, { streaming });
            await vi.advanceTimersByTimeAsync(0);
        };
        await pass(head);
        expect(root.querySelector('.aparte-echarts-pending')).not.toBeNull();
        await pass(`${head}1, 2`);
        expect(instances).toHaveLength(1);
        await pass(`${head}1, 2, 3, `);
        await pass(`${head}1, 2, 3]}]}`, false);
        // One chart all along: each frame merged into it, the first drawn anew.
        expect(instances).toHaveLength(1);
        const told = instances[0]!.options.map((o) => [(o.option['series'] as Array<{ data: number[] }>)[0]!.data, o.opts?.notMerge ?? false]);
        expect(told).toEqual([[[1], true], [[1, 2, 3], false], [[1, 2, 3], false]]);
        expect(root.querySelectorAll('aparte-echarts')).toHaveLength(1);
        // The frames it replaced let it go without disposing it.
        await vi.advanceTimersByTimeAsync(2000);
        expect(instances[0]!.disposed).toBe(false);
    });
});

describe('the chart\'s lifetime', () => {
    it('resizes with its box', async () => {
        const observed: Array<() => void> = [];
        vi.stubGlobal('ResizeObserver', class {
            constructor(private cb: () => void) {}
            observe() { observed.push(this.cb); }
            disconnect() {}
        });
        const { echarts, instances } = fakeECharts();
        setupEChartsWith(echarts);
        renderCodeLanguages(reply(JSON.stringify(BAR)));
        await flush();
        observed[0]!();
        expect(instances[0]!.resized).toBe(1);
    });

    it('holds every title to the new width when its box resizes', async () => {
        const observed: Array<() => void> = [];
        vi.stubGlobal('ResizeObserver', class {
            constructor(private cb: () => void) {}
            observe() { observed.push(this.cb); }
            disconnect() {}
        });
        let width = 0;
        vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
        const { echarts, instances } = fakeECharts();
        setupEChartsWith(echarts);
        // Two titles, one that is not an object: ECharts takes an array, and a model writes anything.
        renderCodeLanguages(reply(JSON.stringify({ ...BAR, title: [{ text: 'Sales by month' }, 'stray'] })));
        await flush();
        // No width yet (not laid out): the titles are left as written.
        expect(instances[0]!.options[0]!.option['title']).toEqual([{ text: 'Sales by month' }, 'stray']);
        width = 400;
        observed[0]!();
        const last = instances[0]!.options.at(-1)!.option;
        expect(last['title']).toEqual([{ text: 'Sales by month', textStyle: { width: 368, overflow: 'truncate' } }, 'stray']);
    });

    it('asks nothing of the titles on a resize when the option has none', async () => {
        const observed: Array<() => void> = [];
        vi.stubGlobal('ResizeObserver', class {
            constructor(private cb: () => void) {}
            observe() { observed.push(this.cb); }
            disconnect() {}
        });
        vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
        const { echarts, instances } = fakeECharts();
        setupEChartsWith(echarts);
        const { title: _title, ...untitled } = BAR;
        renderCodeLanguages(reply(JSON.stringify(untitled)));
        await flush();
        const before = instances[0]!.options.length;
        observed[0]!();
        expect(instances[0]!.resized).toBe(1);
        expect(instances[0]!.options).toHaveLength(before);
    });

    it('notes a chart that throws while it is resized, and draws it no more', async () => {
        const observed: Array<() => void> = [];
        vi.stubGlobal('ResizeObserver', class {
            constructor(private cb: () => void) {}
            observe() { observed.push(this.cb); }
            disconnect() {}
        });
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        let width = 0;
        vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
        // The fake throws on an option holding this text: only the resize's title fit has it.
        const { echarts, instances } = fakeECharts('"overflow"');
        setupEChartsWith(echarts);
        const root = reply(JSON.stringify(BAR));
        renderCodeLanguages(root);
        await flush();
        width = 400;
        observed[0]!();
        expect(instances[0]!.disposed).toBe(true);
        expect(root.querySelector('aparte-echarts .aparte-code-error')).not.toBeNull();
    });

    it('is disposed a moment after it leaves the page, and kept when it comes back in time', async () => {
        vi.useFakeTimers();
        const { echarts, instances } = fakeECharts();
        setupEChartsWith(echarts);
        const root = reply(JSON.stringify(BAR));
        renderCodeLanguages(root);
        await vi.advanceTimersByTimeAsync(0);
        const figure = root.querySelector('aparte-echarts')!;
        const elsewhere = document.createElement('div');
        document.body.append(elsewhere);
        // Moved: out and back in.
        figure.remove();
        elsewhere.append(figure);
        await vi.advanceTimersByTimeAsync(2000);
        expect(instances[0]!.disposed).toBe(false);
        expect(instances).toHaveLength(1);
        // Gone.
        figure.remove();
        await vi.advanceTimersByTimeAsync(500);
        expect(instances[0]!.disposed).toBe(false);
        await vi.advanceTimersByTimeAsync(600);
        expect(instances[0]!.disposed).toBe(true);
    });

    it('is not drawn when it leaves before ECharts has loaded', async () => {
        vi.useFakeTimers();
        let resolve!: (e: EChartsLike) => void;
        const { echarts, instances } = fakeECharts();
        setupEChartsWith(() => new Promise<EChartsLike>((r) => { resolve = r; }));
        const root = reply(JSON.stringify(BAR));
        renderCodeLanguages(root);
        root.remove();
        await vi.advanceTimersByTimeAsync(1500);
        resolve(echarts);
        await vi.advanceTimersByTimeAsync(0);
        expect(instances).toHaveLength(0);
    });

    it('the disposer unregisters the renderers and disposes every chart', async () => {
        const { echarts, instances } = fakeECharts();
        const dispose = setupEChartsWith(echarts, { tool: 'chart' });
        renderCodeLanguages(reply(JSON.stringify(BAR)));
        await flush();
        dispose();
        expect(instances[0]!.disposed).toBe(true);
        expect(aparteGlobalConfig.hasCodeLanguageRenderer('echarts')).toBe(false);
        expect(aparteGlobalConfig.hasCodeLanguageRenderer('echart')).toBe(false);
    });

    it('shows the note for a box whose option is not one', async () => {
        setupEChartsWith(fakeECharts().echarts);
        const drawing = document.createElement('span');
        drawing.innerHTML = renderer().render(ctx(JSON.stringify(BAR))) as string;
        const figure = drawing.firstElementChild!;
        figure.setAttribute('data-aparte-echarts-option', '[1, 2]');
        document.body.append(drawing);
        expect(figure.querySelector('[role="note"]')!.textContent).toBe('This chart could not be drawn.');
    });
});

describe('the theme', () => {
    it('is the chat\'s, and a light/dark switch recolours the chart without drawing it again', async () => {
        const { echarts, instances } = fakeECharts();
        setupEChartsWith(echarts);
        const root = reply(JSON.stringify(BAR));
        renderCodeLanguages(root);
        await flush();
        const chart = instances[0]!;
        expect(chart.theme['backgroundColor']).toBe('transparent');
        expect(Array.isArray(chart.theme['color'])).toBe(true);
        // A switch that changes no colour costs nothing.
        document.documentElement.setAttribute('data-aparte-theme', 'dark');
        await flush();
        expect(chart.themes).toHaveLength(0);
        // One that does recolours it in place.
        root.style.setProperty('--aparte-text', '#eeeeee');
        const real = window.getComputedStyle.bind(window);
        vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
            const style = real(el);
            return new Proxy(style, { get: (t, k) => (k === 'color' ? 'rgb(1, 2, 3)' : typeof Reflect.get(t, k) === 'function' ? (Reflect.get(t, k) as (...args: unknown[]) => unknown).bind(t) : Reflect.get(t, k)) });
        });
        document.documentElement.setAttribute('data-aparte-theme', 'light');
        await flush();
        expect(chart.themes).toHaveLength(1);
        expect(chart.themes[0]!['textStyle'].color).toBe('rgb(1, 2, 3)');
        expect(chart.options).toHaveLength(1);
        // And the system's colour scheme is watched too.
        expect(media.listeners).toHaveLength(1);
    });

    it('watches a chat inside a shadow root', async () => {
        const { echarts } = fakeECharts();
        const dispose = setupEChartsWith(echarts);
        const host = document.createElement('div');
        document.body.append(host);
        const shadow = host.attachShadow({ mode: 'open' });
        const root = document.createElement('div');
        root.innerHTML = `<pre><code class="language-echarts">${JSON.stringify(BAR)}</code></pre>`;
        shadow.append(root);
        const observe = vi.spyOn(MutationObserver.prototype, 'observe');
        renderCodeLanguages(root);
        await flush();
        expect(observe).toHaveBeenCalledWith(shadow, expect.objectContaining({ attributeFilter: ['data-aparte-theme'] }));
        dispose();
        expect(media.listeners).toHaveLength(0);
    });
});

describe('a tool whose result is an option', () => {
    const segment = (over: Partial<AparteToolCallSegment>): AparteToolCallSegment => ({
        id: 't1', type: 'tool_call', status: 'pending', toolCall: { id: 'c1', name: 'chart', input: { metric: 'sales' } }, ...over,
    } as AparteToolCallSegment);
    const toolRenderer = () => aparteGlobalConfig.getToolRenderer('chart')!;

    it('shows a quiet box while it runs, then the chart in place of its row', async () => {
        const { echarts, instances } = fakeECharts();
        setupEChartsWith(echarts, { tool: ['chart', /^plot_/] });
        const r = toolRenderer();
        const el = r.render(segment({})) as HTMLElement;
        document.body.append(el);
        expect(el.getAttribute('aria-busy')).toBe('true');
        expect(el.getAttribute('aria-label')).toBe('Loading chart');
        expect(el.querySelector('.aparte-skeleton')).not.toBeNull();
        r.update!(el, segment({ status: 'resolved', structuredResult: BAR, result: 'ignored' }));
        await flush();
        expect(el.hasAttribute('aria-busy')).toBe(false);
        expect(el.querySelector('aparte-echarts')!.getAttribute('aria-label')).toBe('Sales by month');
        expect(instances).toHaveLength(1);
        expect(aparteGlobalConfig.getToolRenderer('plot_sales')).toBe(r);
        // An update that changes nothing redraws nothing.
        r.update!(el, segment({ status: 'resolved', structuredResult: BAR, result: 'ignored' }));
        await flush();
        expect(instances).toHaveLength(1);
        r.cleanup!(el, segment({ status: 'resolved' }));
        expect(instances[0]!.disposed).toBe(true);
    });

    it('reads the result\'s text as JSON when it has no structured content', async () => {
        const { echarts, instances } = fakeECharts();
        setupEChartsWith(echarts, { tool: 'chart' });
        const el = toolRenderer().render(segment({ status: 'resolved', result: ` ${JSON.stringify(BAR)} ` })) as HTMLElement;
        document.body.append(el);
        await flush();
        expect(instances[0]!.options[0]!.option['title']).toEqual({ text: 'Sales by month' });
    });

    it('turns a tool\'s own data into the option with `map`', async () => {
        const { echarts, instances } = fakeECharts();
        const map = vi.fn((result: unknown, input: Record<string, unknown>) => ({
            title: { text: String(input['metric']) },
            series: [{ type: 'line', data: (result as { points: number[] }).points }],
        }));
        setupEChartsWith(echarts, { tool: 'chart', map });
        const el = toolRenderer().render(segment({ status: 'resolved', structuredResult: { points: [1, 2] } })) as HTMLElement;
        document.body.append(el);
        await flush();
        expect(map).toHaveBeenCalledWith({ points: [1, 2] }, { metric: 'sales' });
        expect(instances[0]!.options[0]!.option['series']).toEqual([{ type: 'line', data: [1, 2] }]);
    });

    it('says so in one line when the result is not a chart, or `map` throws', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        setupEChartsWith(fakeECharts().echarts, { tool: 'chart', map: (r) => { if (r === 'boom') throw new Error('boom'); return r; } });
        const notChart = toolRenderer().render(segment({ status: 'resolved', result: 'Sunny, 21°C' })) as HTMLElement;
        expect(notChart.textContent).toBe('This chart could not be drawn.');
        const threw = toolRenderer().render(segment({ status: 'resolved', structuredResult: 'boom' })) as HTMLElement;
        expect(threw.querySelector('[role="note"]')!.textContent).toBe('This chart could not be drawn.');
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('says why in one line when the call is waiting, refused, stopped or failed — in the chat\'s language', () => {
        setupEChartsWith(fakeECharts().echarts, { tool: 'chart' });
        const r = toolRenderer();
        const text = (status: AparteToolCallSegment['status']) => (r.render(segment({ status })) as HTMLElement).textContent;
        expect(text('awaiting-approval')).toBe('Waiting for your approval');
        expect(text('rejected')).toBe('No chart: the tool did not run.');
        expect(text('aborted')).toBe('No chart: the tool did not run.');
        expect(text('failed')).toBe('No chart: the tool failed.');
        const el = r.render(segment({ status: 'failed' })) as HTMLElement;
        aparteGlobalConfig.extendLocale({ tag: 'fr' });
        r.relabel!(el, segment({ status: 'failed' }));
        expect(el.textContent).toBe('Pas de graphique : l’outil a échoué.');
        const pending = r.render(segment({})) as HTMLElement;
        aparteGlobalConfig.extendLocale({ echartsLoading: 'Un instant' });
        r.relabel!(pending, segment({}));
        expect(pending.getAttribute('aria-label')).toBe('Un instant');
    });

    it('names the chart again on a language switch', async () => {
        setupEChartsWith(fakeECharts().echarts, { tool: 'chart' });
        const r = toolRenderer();
        const el = r.render(segment({ status: 'resolved', structuredResult: { series: [{ type: 'pie', data: [] }] } })) as HTMLElement;
        document.body.append(el);
        await flush();
        aparteGlobalConfig.extendLocale({ tag: 'ja' });
        r.relabel!(el, segment({ status: 'resolved' }));
        expect(el.querySelector('aparte-echarts')!.getAttribute('aria-label')).toBe('グラフ');
    });
});
