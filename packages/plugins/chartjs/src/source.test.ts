/**
 * Reading a config a model wrote or a tool returned: what is kept, what is taken out, and
 * how a config still arriving is read before its last brace.
 */
import { describe, it, expect } from 'vitest';
import { closeJson, dataTable, hasPoints, parseFence, readChartConfig, titleOf, type ChartjsConfig } from './source.js';

const bar = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    type: 'bar',
    data: { labels: ['Jan', 'Feb'], datasets: [{ label: 'Sales', data: [3, 5] }] },
    ...over,
});

describe('readChartConfig', () => {
    it('keeps a config Chart.js can draw', () => {
        expect(readChartConfig(bar())).toEqual(bar());
    });

    it.each([
        ['no type', { data: { datasets: [] } }],
        ['a type that is not a name', { type: 'bar;x', data: { datasets: [] } }],
        ['no data', { type: 'bar' }],
        ['datasets that are not a list', { type: 'bar', data: { datasets: {} } }],
        ['a dataset with no data list', { type: 'bar', data: { datasets: [{ data: 3 }] } }],
        ['labels that are not a list', { type: 'bar', data: { labels: 'a', datasets: [] } }],
        ['a list', [1, 2]],
        ['a string', 'bar'],
    ])('refuses %s', (_what, value) => {
        expect(readChartConfig(value)).toBeNull();
    });

    it('drops the config\'s own plugin list, which can only hold objects with no hooks', () => {
        const out = readChartConfig(bar({ plugins: [{ id: 'x', beforeDraw: 'alert(1)' }], options: { plugins: { legend: { display: false } } } }))!;
        expect(out['plugins']).toBeUndefined();
        // Options for the registered plugins stay.
        expect(out.options).toEqual({ plugins: { legend: { display: false } } });
    });

    it('drops what could make Chart.js throw on every frame, or reach a prototype', () => {
        const value = JSON.parse('{"type":"line","data":{"datasets":[{"data":[1],"pointStyle":{"toString":"[object HTMLImageElement]","src":"https://x"}}]},"__proto__":{"polluted":true},"constructor":{"prototype":{}}}');
        const out = readChartConfig(value)!;
        expect(Object.keys((out.data.datasets[0]!['pointStyle']) as object)).toEqual(['src']);
        expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(false);
        expect(out['constructor']).toBe(Object);
        expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    });

    it('keeps the canvas a size a browser can allocate', () => {
        const out = readChartConfig(bar({ options: { devicePixelRatio: 400, aspectRatio: 0.0001 } }))!;
        expect(out.options!['devicePixelRatio']).toBeUndefined();
        expect(out.options!['aspectRatio']).toBe(0.25);
        expect(readChartConfig(bar({ options: { aspectRatio: 40 } }))!.options!['aspectRatio']).toBe(4);
        expect(readChartConfig(bar({ options: { aspectRatio: 'wide' } }))!.options!['aspectRatio']).toBeUndefined();
    });

    it('drops a locale Intl refuses, keeps one it takes', () => {
        expect(readChartConfig(bar({ options: { locale: 'not a locale!' } }))!.options!['locale']).toBeUndefined();
        expect(readChartConfig(bar({ options: { locale: 'fr-FR' } }))!.options!['locale']).toBe('fr-FR');
        expect(readChartConfig(bar({ options: { locale: 3 } }))!.options!['locale']).toBeUndefined();
    });

    it('drops options that are not an object', () => {
        expect(readChartConfig(bar({ options: [1] }))!.options).toBeUndefined();
    });

    it('turns what JSON cannot carry into nothing', () => {
        const out = readChartConfig({ type: 'bar', data: { datasets: [{ data: [1, Infinity, NaN] }] }, f: () => 1, u: undefined })!;
        expect(out.data.datasets[0]!['data']).toEqual([1, null, null]);
        expect('f' in out).toBe(false);
        expect('u' in out).toBe(false);
    });

    it('holds a scale to a hundred ticks, which Chart.js allocates by the number asked', () => {
        // `ticks.count` is taken as it is: 100 000 000 asks for that many tick objects.
        const out = readChartConfig(bar({ options: { scales: { y: { min: 0, max: 1, ticks: { count: 1e8, maxTicksLimit: 1e6 } }, x: { ticks: { count: 5, maxTicksLimit: 'many' } }, r: { ticks: { count: -3 } }, z: 3 } } }))!;
        const scales = out.options!['scales'] as Record<string, Record<string, Record<string, unknown>>>;
        expect(scales['y']!['ticks']).toEqual({ count: 100, maxTicksLimit: 100 });
        expect(scales['x']!['ticks']).toEqual({ count: 5 });
        expect(scales['r']!['ticks']).toEqual({});
        expect(scales['z']).toBe(3);
    });

    it('drops a string where Chart.js calls a function, which would throw on every hover', () => {
        const out = readChartConfig(bar({
            options: {
                plugins: {
                    tooltip: { external: 'x', filter: 'x', itemSort: 'x', callbacks: { label: 'x' }, position: 'nowhere', enabled: true },
                    legend: { labels: { generateLabels: 'x', filter: 'x', sort: 'x', color: 'red' }, position: 'top' },
                },
            },
        }))!;
        const plugins = out.options!['plugins'] as Record<string, unknown>;
        expect(plugins['tooltip']).toEqual({ enabled: true });
        expect(plugins['legend']).toEqual({ labels: { color: 'red' }, position: 'top' });
        // Chart.js' own positioners stay.
        const nearest = readChartConfig(bar({ options: { plugins: { tooltip: { position: 'nearest' } } } }))!;
        expect((nearest.options!['plugins'] as Record<string, Record<string, unknown>>)['tooltip']).toEqual({ position: 'nearest' });
    });

    it('drops an animation that loops forever', () => {
        const out = readChartConfig({
            type: 'line',
            data: { datasets: [{ data: [1], animations: { radius: { loop: true, duration: 400 } } }] },
            options: { animation: { loop: true, duration: 300 }, animations: { tension: { loop: true, from: 1, to: 0 } }, plugins: { legend: { loop: 'kept' } } },
        })!;
        expect(out.options!['animation']).toEqual({ duration: 300 });
        expect(out.options!['animations']).toEqual({ tension: { from: 1, to: 0 } });
        expect(out.data.datasets[0]!['animations']).toEqual({ radius: { duration: 400 } });
        // Outside an animation, `loop` is no key of Chart.js': left to whoever reads it.
        expect((out.options!['plugins'] as Record<string, Record<string, unknown>>)['legend']).toEqual({ loop: 'kept' });
    });

    it('counts labels and datasets against `maxPoints` too', () => {
        const labels = (n: number) => Array.from({ length: n }, (_, i) => `l${i}`);
        expect(readChartConfig({ type: 'bar', data: { labels: labels(30), datasets: [{ data: [1] }] } }, 20)).toBeNull();
        expect(readChartConfig({ type: 'bar', data: { labels: labels(2), datasets: Array.from({ length: 30 }, () => ({ data: [] })) } }, 20)).toBeNull();
        expect(readChartConfig({ type: 'bar', data: { labels: labels(20), datasets: Array.from({ length: 20 }, () => ({ data: [] })) } }, 20)).not.toBeNull();
    });

    it('refuses more points than a chat chart needs, and a config nested past reason', () => {
        const big = { type: 'line', data: { datasets: [{ data: Array.from({ length: 30 }, (_, i) => i) }] } };
        expect(readChartConfig(big, 20)).toBeNull();
        expect(readChartConfig(big, 30)).not.toBeNull();
        let deep: Record<string, unknown> = {};
        const root = deep;
        for (let i = 0; i < 40; i++) { deep['a'] = {}; deep = deep['a'] as Record<string, unknown>; }
        expect(readChartConfig({ ...bar(), options: root })).toBeNull();
    });
});

describe('closeJson', () => {
    it.each([
        ['{"a": [1, 2', '{"a": [1]}'],
        ['{"a": [1, 2]', '{"a": [1, 2]}'],
        ['{"a": {"b": 1', '{"a": {}}'],
        ['{"a": "x, y', '{}'],
        ['{"a": "say \\"hi\\", [ok', '{}'],
        ['[{"x": 1}, {"x"', '[{"x": 1}, {}]'],
        ['{"a":', '{}'],
        ['{"a": 1} trailing', '{"a": 1}'],
    ])('closes %s as %s', (text, closed) => {
        expect(closeJson(text)).toBe(closed);
        expect(() => JSON.parse(closeJson(text)!)).not.toThrow();
    });

    it('has nothing before the first bracket, and refuses brackets that do not match', () => {
        expect(closeJson('  ')).toBeNull();
        expect(closeJson('{"a": [1}')).toBeNull();
    });
});

describe('parseFence', () => {
    it('reads all of a closed fence, and refuses one that is not JSON', () => {
        expect(parseFence(JSON.stringify(bar()), false)).toEqual(bar());
        expect(parseFence('{"type": "bar",', false)).toBeNull();
    });

    it('reads the part of an open fence that has arrived', () => {
        const text = '{"type":"bar","data":{"labels":["a","b"],"datasets":[{"data":[1,2';
        const out = parseFence(text, true)!;
        expect(out.data.datasets[0]!['data']).toEqual([1]);
        expect(hasPoints(out)).toBe(true);
        expect(parseFence('{"type":"bar","data":{"datasets":[', true)).not.toBeNull();
        expect(hasPoints(parseFence('{"type":"bar","data":{"datasets":[', true)!)).toBe(false);
        expect(parseFence('', true)).toBeNull();
    });
});

describe('titleOf', () => {
    it('reads the title plugin\'s text, as one line', () => {
        expect(titleOf(bar({ options: { plugins: { title: { text: ' Revenue ' } } } }) as unknown as ChartjsConfig)).toBe('Revenue');
        expect(titleOf(bar({ options: { plugins: { title: { text: ['Revenue', 'by month', 3] } } } }) as unknown as ChartjsConfig)).toBe('Revenue by month');
        expect(titleOf(bar() as unknown as ChartjsConfig)).toBeUndefined();
    });
});

describe('dataTable', () => {
    const table = (config: Record<string, unknown>): HTMLTableElement => {
        const el = document.createElement('div');
        el.innerHTML = dataTable(config as unknown as ChartjsConfig, 'en-US');
        return el.querySelector('table')!;
    };

    it('has a row per label and a column per dataset', () => {
        const t = table({ type: 'bar', data: { labels: ['Jan', 'Feb'], datasets: [{ label: 'A', data: [1200, 5] }, { data: [3] }] } });
        expect(Array.from(t.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual(['A', '']);
        expect(t.querySelector('thead th[data-aparte-chartjs-series="2"]')).not.toBeNull();
        expect(Array.from(t.querySelectorAll('tbody tr')).map((tr) => tr.textContent)).toEqual(['Jan1,2003', 'Feb5']);
    });

    it('names a row by its point\'s x when there are no labels, and shows a bubble\'s radius', () => {
        const t = table({ type: 'bubble', data: { datasets: [{ data: [{ x: 2, y: 3, r: 9 }, { x: 'b', y: 'c' }, 7, true] }] } });
        expect(Array.from(t.querySelectorAll('tbody tr')).map((tr) => [tr.querySelector('th')!.textContent, tr.querySelector('td')!.textContent]))
            .toEqual([['2', '3 (9)'], ['b', 'c'], ['3', '7'], ['4', '']]);
    });

    it('reads a multi-line label as one line, and escapes every value', () => {
        const t = table({ type: 'bar', data: { labels: [['Q1', '2026'], '<img src=x onerror=alert(1)>'], datasets: [{ label: '<b>A</b>', data: ['<i>1</i>', 2] }] } });
        expect(t.querySelector('img, b, i')).toBeNull();
        expect(t.querySelector('tbody th')!.textContent).toBe('Q1 2026');
        expect(t.querySelectorAll('tbody th')[1]!.textContent).toBe('<img src=x onerror=alert(1)>');
    });

    it('lists no column for a dataset with no data, and keeps the others\' numbers', () => {
        const t = table({ type: 'bar', data: { labels: ['a'], datasets: [{ data: [] }, { data: [1] }, { label: 'C', data: [2] }] } });
        expect(t.querySelector('thead th[data-aparte-chartjs-series]')!.getAttribute('data-aparte-chartjs-series')).toBe('2');
        expect(Array.from(t.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual(['', 'C']);
        expect(t.querySelector('tfoot')).toBeNull();
    });

    it('holds the table to ten thousand cells, and says so when it is cut', () => {
        // 2000 empty datasets beside 2000 labels: a few kilobytes that asked for four million cells.
        const labels = Array.from({ length: 2000 }, (_, i) => i);
        const empty = table({ type: 'bar', data: { labels, datasets: [{ data: [1] }, ...Array.from({ length: 2000 }, () => ({ data: [] }))] } });
        expect(empty.querySelectorAll('thead th')).toHaveLength(1);
        expect(empty.querySelectorAll('td, tbody th').length).toBeLessThanOrEqual(10000);
        const wide = table({ type: 'bar', data: { labels, datasets: Array.from({ length: 200 }, () => ({ data: [1, 2] })) } });
        expect(wide.querySelectorAll('td, tbody th').length).toBeLessThanOrEqual(10000);
        const note = wide.querySelector('tfoot td[data-aparte-chartjs-cut]')!;
        expect(note.getAttribute('colspan')).toBe(String(wide.querySelector('thead tr')!.children.length));
    });

    it('falls back to the browser\'s number format for a locale Intl refuses', () => {
        const el = document.createElement('div');
        el.innerHTML = dataTable(bar() as unknown as ChartjsConfig, 'not a locale!');
        expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    });
});
