/**
 * The option as the plugin reads it — pure, so checked without a DOM or ECharts: what is
 * stripped from a model's option, how a fence still arriving is read, and the table a
 * screen reader gets.
 */
import { describe, it, expect } from 'vitest';
import { drawable, parseOption, sanitizeEChartsOption, tableOf, titleOf } from './option.js';

describe('sanitizeEChartsOption', () => {
    it('refuses what is not an object', () => {
        expect(sanitizeEChartsOption([1, 2])).toBeNull();
        expect(sanitizeEChartsOption('x')).toBeNull();
        expect(sanitizeEChartsOption(null)).toBeNull();
    });

    it('draws every tooltip, never writes it as HTML', () => {
        const clean = sanitizeEChartsOption({
            tooltip: { renderMode: 'html', extraCssText: 'background:url(x)', className: 'evil', appendTo: 'body', appendToBody: true, formatter: '<b>{b}</b>: {c}' },
            series: [{ type: 'bar', tooltip: { renderMode: 'auto' }, data: [{ value: 1, tooltip: { formatter: 'x' } }] }],
        })!;
        expect(clean['tooltip']).toEqual({ renderMode: 'richText', formatter: '<b>{b}</b>: {c}' });
        const series = (clean['series'] as Array<Record<string, unknown>>)[0]!;
        expect(series['tooltip']).toEqual({ renderMode: 'richText' });
        expect((series['data'] as Array<Record<string, unknown>>)[0]!['tooltip']).toEqual({ formatter: 'x', renderMode: 'richText' });
    });

    it('forces rich text on an array of tooltips too', () => {
        const clean = sanitizeEChartsOption({ tooltip: [{ show: true }, { renderMode: 'html' }] })!;
        expect(clean['tooltip']).toEqual([{ show: true, renderMode: 'richText' }, { renderMode: 'richText' }]);
    });

    it('drops the toolbox buttons that leave the drawing', () => {
        const clean = sanitizeEChartsOption({ toolbox: { feature: { saveAsImage: {}, dataView: { readOnly: true }, restore: {}, dataZoom: {} } } })!;
        expect(clean['toolbox']).toEqual({ feature: { restore: {}, dataZoom: {} } });
    });

    it('drops images: graphic elements, picture fills, image:// symbols, CSS urls', () => {
        const clean = sanitizeEChartsOption({
            backgroundColor: { image: 'https://evil.test/a.png', repeat: 'repeat' },
            graphic: [{ type: 'image', style: { image: 'https://evil.test/b.png' } }, { type: 'text', style: { text: 'hi' } }],
            legend: { icon: 'image://https://evil.test/c.png' },
            series: [{
                type: 'line',
                symbol: 'IMAGE://data:image/png;base64,AAA',
                itemStyle: { color: 'url(https://evil.test/p.svg#g)', borderColor: '#333' },
                label: { rich: { a: { backgroundColor: { image: 'x.png' } } } },
                data: [1, 'image://x', 3],
            }],
            title: { text: 'Curl (cURL) usage' },
        })!;
        expect(clean['backgroundColor']).toBeUndefined();
        expect(clean['graphic']).toEqual([{ type: 'text', style: { text: 'hi' } }]);
        expect(clean['legend']).toEqual({});
        const series = (clean['series'] as Array<Record<string, unknown>>)[0]!;
        expect(series['symbol']).toBeUndefined();
        expect(series['itemStyle']).toEqual({ borderColor: '#333' });
        expect(series['label']).toEqual({ rich: { a: {} } });
        // A dropped value keeps its place: the point after it keeps its index.
        expect(series['data']).toEqual([1, null, 3]);
        expect(clean['title']).toEqual({ text: 'Curl (cURL) usage' });
    });

    it('drops a CSS url() spelled with escapes, which a fill or a stroke still resolves', () => {
        // zrender copies a colour string verbatim into an SVG `fill` / `stroke` attribute,
        // and CSS reads `u\rl(`, `u\72 l(` and `\75 rl(` as `url(`: a request.
        const forms = [
            String.raw`u\rl(https://evil.test/a.svg#a)`, String.raw`u\72 l(https://evil.test/b.svg#b)`,
            String.raw`\75 rl(https://evil.test/c.svg#c)`, String.raw`\000055RL(https://evil.test/d)`, String.raw`U\52L(https://evil.test/e)`,
        ];
        for (const evil of forms) {
            const clean = sanitizeEChartsOption({ series: [{ type: 'bar', itemStyle: { color: evil, borderColor: evil, shadowColor: evil }, lineStyle: { color: [evil] } }], graphic: [{ type: 'rect', style: { fill: evil, stroke: evil } }] })!;
            expect(JSON.stringify(clean), evil).not.toContain('evil.test');
        }
        // Not only where a colour goes: a string that unescapes to a url(), or that pairs a
        // backslash with a bracket, goes wherever it is.
        const elsewhere = sanitizeEChartsOption({ title: { text: String.raw`\75 rl(https://evil.test/t)`, subtext: String.raw`f\(x)` }, series: [{ name: String.raw`a\b`, data: [1] }] })!;
        expect(elsewhere['title']).toEqual({});
        expect((elsewhere['series'] as Array<Record<string, unknown>>)[0]!['name']).toBe(String.raw`a\b`);
    });

    it('takes only colour syntax where a colour goes', () => {
        const kept = ['red', 'transparent', 'none', 'inherit', 'auto', '#abc', '#a1b2c3d4', 'rgb(1, 2, 3)', 'rgba(1,2,3,.5)', 'hsl(120 50% 50% / 0.4)', 'HSLA(120, 50%, 50%, 1)'];
        for (const colour of kept) {
            const clean = sanitizeEChartsOption({ series: [{ itemStyle: { color: colour, borderColor: colour } }], graphic: [{ type: 'rect', style: { fill: colour } }] })!;
            expect((clean['series'] as Array<Record<string, any>>)[0]!['itemStyle'], colour).toEqual({ color: colour, borderColor: colour });
        }
        const dropped = ['red;stroke:blue', 'expression(alert(1))', 'var(--x)', 'rgb(1,2,3) url(x)', '#zz', 'paint(x)', 'red blue'];
        for (const colour of dropped) {
            const clean = sanitizeEChartsOption({ color: [colour], series: [{ itemStyle: { color: colour, textBorderColor: colour } }], graphic: [{ type: 'rect', style: { fill: colour, stroke: colour } }] })!;
            expect(JSON.stringify(clean), colour).toBe('{"color":[null],"series":[{"itemStyle":{}}],"graphic":[{"type":"rect","style":{}}]}');
        }
        // A candlestick's falling colours, and the keys about colour that hold none.
        const candle = sanitizeEChartsOption({ series: [{ type: 'candlestick', itemStyle: { color0: 'red;x', borderColor0: '#0f0', borderColorDoji: 'rgb(1,2,3)' }, colorBy: 'data' }], visualMap: { inRange: { colorAlpha: [0.2, 1] } } })!;
        expect((candle['series'] as Array<Record<string, any>>)[0]).toEqual({ type: 'candlestick', itemStyle: { borderColor0: '#0f0', borderColorDoji: 'rgb(1,2,3)' }, colorBy: 'data' });
        expect(candle['visualMap']).toEqual({ inRange: { colorAlpha: [0.2, 1] } });
        // A gradient is an object ECharts builds itself; its stops are colours too.
        const gradient = { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#fff' }, { offset: 1, color: 'url(x)' }] };
        const clean = sanitizeEChartsOption({ series: [{ areaStyle: { color: gradient } }] })!;
        expect((clean['series'] as Array<Record<string, any>>)[0]!['areaStyle']['color']['colorStops']).toEqual([{ offset: 0, color: '#fff' }, { offset: 1 }]);
        // A gauge's bands: [stop, colour] pairs.
        const gauge = sanitizeEChartsOption({ series: [{ type: 'gauge', axisLine: { lineStyle: { color: [[0.3, '#67e0e3'], [1, String.raw`u\rl(x)`]] } } }] })!;
        expect((gauge['series'] as Array<Record<string, any>>)[0]!['axisLine']['lineStyle']['color']).toEqual([[0.3, '#67e0e3'], [1, null]]);
    });

    it('drops a regular expression a dataset filter would compile', () => {
        // `{ reg: '^(a+)+$' }` is `new RegExp(…)` run on every value: a catastrophic backtrack.
        const clean = sanitizeEChartsOption({
            dataset: [{ source: [['x', 'y'], ['a', 1]] }, { transform: { type: 'filter', config: { and: [{ dimension: 'x', reg: '^(a+)+$' }, { dimension: 'y', '>': 0 }] } } }],
            baseOption: { dataset: { transform: { type: 'filter', config: { dimension: 'x', reg: 'a' } } } },
            options: [{ dataset: { transform: [{ config: { reg: 'a' } }] } }],
            media: [{ option: { dataset: { transform: { config: { reg: 'a' } } } } }],
        })!;
        expect(JSON.stringify(clean)).not.toContain('reg');
        expect((clean['dataset'] as Array<Record<string, any>>)[1]!['transform']['config']).toEqual({ and: [{ dimension: 'x' }, { dimension: 'y', '>': 0 }] });
    });

    it('drops an SVG pattern ECharts would build node by node', () => {
        const clean = sanitizeEChartsOption({ color: [{ svgElement: { tag: 'script', attrs: { href: 'https://evil.test/x.js' } }, svgWidth: 4 }, '#123456'] })!;
        expect(clean['color']).toEqual(['#123456']);
    });

    it('drops links a click would open, and keeps an axis pointer linking axes', () => {
        const clean = sanitizeEChartsOption({
            title: { text: 'T', link: 'javascript:alert(1)', sublink: 'https://x.test', target: 'self' },
            series: [{ type: 'treemap', data: [{ name: 'a', value: 1, link: 'javascript:alert(2)' }] }],
            axisPointer: { link: [{ xAxisIndex: 'all' }] },
        })!;
        expect(clean['title']).toEqual({ text: 'T', target: 'self' });
        expect((clean['series'] as Array<Record<string, unknown>>)[0]!['data']).toEqual([{ name: 'a', value: 1 }]);
        expect(clean['axisPointer']).toEqual({ link: [{ xAxisIndex: 'all' }] });
    });

    it('drops a font value that would add CSS declarations to a text\'s style', () => {
        const clean = sanitizeEChartsOption({
            textStyle: { fontFamily: 'Inter, "Segoe UI", sans-serif', fontWeight: 600, fontSize: '14px' },
            title: { textStyle: { fontFamily: 'x; fill: red', fontStyle: 'italic' } },
            legend: { textStyle: { fontSize: '12px}' } },
        })!;
        expect(clean['textStyle']).toEqual({ fontFamily: 'Inter, "Segoe UI", sans-serif', fontWeight: 600, fontSize: '14px' });
        expect(clean['title']).toEqual({ textStyle: { fontStyle: 'italic' } });
        expect(clean['legend']).toEqual({ textStyle: {} });
    });

    it('drops prototype keys and what is nested past any real option', () => {
        const parsed = JSON.parse('{"__proto__": {"polluted": true}, "constructor": 1, "series": []}');
        const clean = sanitizeEChartsOption(parsed)!;
        expect(Object.keys(clean)).toEqual(['series']);
        let deep: Record<string, unknown> = { leaf: 1 };
        for (let i = 0; i < 80; i++) deep = { n: deep };
        const cut = JSON.stringify(sanitizeEChartsOption(deep));
        expect(cut).not.toContain('leaf');
    });

    it('keeps everything else as it was', () => {
        const option = { xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: [1, 2], label: { show: true, formatter: '{c} €' } }], animation: true };
        expect(sanitizeEChartsOption(option)).toEqual(option);
    });
});

describe('parseOption', () => {
    it('reads a whole fence as JSON, and a broken closed one as nothing', () => {
        expect(parseOption('{"a": 1}')).toEqual({ a: 1 });
        expect(parseOption('{"a": 1')).toBeUndefined();
    });

    it('reads a fence still arriving up to its last whole value', () => {
        const source = '{"xAxis": {"data": ["Jan", "Feb", "Mar"]}, "series": [{"type": "bar", "data": [120, 200, 15';
        expect(parseOption(source, true)).toEqual({ xAxis: { data: ['Jan', 'Feb', 'Mar'] }, series: [{ type: 'bar', data: [120, 200] }] });
    });

    it('never cuts inside a string, even one holding brackets and escaped quotes', () => {
        const source = '{"title": {"text": "a, [b] \\" {c}"}, "series": [{"name": "Half wri';
        expect(parseOption(source, true)).toEqual({ title: { text: 'a, [b] " {c}' }, series: [{}] });
    });

    it('reads nothing from a fence that has not opened an object yet', () => {
        expect(parseOption('', true)).toBeUndefined();
        expect(parseOption('{', true)).toEqual({});
        expect(parseOption('nope', true)).toBeUndefined();
    });
});

describe('drawable', () => {
    it('wants a series or a dataset', () => {
        expect(drawable({})).toBe(false);
        expect(drawable({ series: [] })).toBe(false);
        expect(drawable({ series: [{}] })).toBe(true);
        expect(drawable({ series: { type: 'pie' } })).toBe(true);
        expect(drawable({ dataset: { source: [] } })).toBe(true);
        // An option with a timeline or media queries keeps its series under `baseOption`.
        expect(drawable({ baseOption: { series: [{}] } })).toBe(true);
        expect(drawable({ title: { text: 'x' }, baseOption: {} })).toBe(false);
    });
});

describe('titleOf', () => {
    it('reads the first title\'s text', () => {
        expect(titleOf({ title: { text: ' Sales ' } })).toBe('Sales');
        expect(titleOf({ title: [{ text: 'First' }, { text: 'Second' }] })).toBe('First');
        expect(titleOf({ title: { text: '  ' } })).toBeUndefined();
        expect(titleOf({})).toBeUndefined();
    });
});

describe('tableOf', () => {
    it('reads a dataset of rows', () => {
        expect(tableOf({ dataset: { source: [['month', 'sales'], ['Jan', 1], ['Feb', null]] } }))
            .toEqual({ head: ['month', 'sales'], rows: [['Jan', '1'], ['Feb', '']] });
    });

    it('reads a dataset of objects, by its dimensions when it names them', () => {
        expect(tableOf({ dataset: { source: [{ m: 'Jan', v: 1, w: 2 }] } }))
            .toEqual({ head: ['m', 'v', 'w'], rows: [['Jan', '1', '2']] });
        expect(tableOf({ dataset: { dimensions: ['m', { name: 'v' }], source: [{ m: 'Jan', v: 1, w: 2 }] } }))
            .toEqual({ head: ['m', 'v'], rows: [['Jan', '1']] });
    });

    it('reads a category axis with the series beside it', () => {
        expect(tableOf({
            xAxis: { name: 'Month', data: ['Jan', { value: 'Feb' }] },
            series: [{ name: 'Sales', data: [1, { value: 2 }] }, { data: [[3, 4]] }],
        })).toEqual({ head: ['Month', 'Sales', '2'], rows: [['Jan', '1', '3, 4'], ['Feb', '2', '']] });
        expect(tableOf({ yAxis: [{ data: ['A'] }], series: { data: [true] } })).toEqual({ head: ['', '1'], rows: [['A', 'true']] });
    });

    it('reads a series of named values', () => {
        expect(tableOf({ series: [{ type: 'pie', name: 'Share', data: [{ name: 'A', value: 60 }, { name: 'B', value: 40 }, 5] }] }))
            .toEqual({ head: ['', 'Share'], rows: [['A', '60'], ['B', '40'], ['', '5']] });
    });

    it('takes a dataset\'s first row as its header the way ECharts does', () => {
        // `sourceHeader: 'auto'` (the default): a header only when the first row holds no number.
        expect(tableOf({ dataset: { source: [['Jan', 1], ['Feb', 2]] } }))
            .toEqual({ head: ['', ''], rows: [['Jan', '1'], ['Feb', '2']] });
        expect(tableOf({ dataset: { dimensions: ['month', { name: 'sales' }], source: [['Jan', 1]] } }))
            .toEqual({ head: ['month', 'sales'], rows: [['Jan', '1']] });
        expect(tableOf({ dataset: { sourceHeader: true, source: [['Jan', 1], ['Feb', 2]] } }))
            .toEqual({ head: ['Jan', '1'], rows: [['Feb', '2']] });
        expect(tableOf({ dataset: { sourceHeader: false, source: [['month', 'sales'], ['Jan', 1]] } }))
            .toEqual({ head: ['', ''], rows: [['month', 'sales'], ['Jan', '1']] });
        expect(tableOf({ dataset: { source: [[null, '-', 'a'], ['x', 1, 2]] } })!.head).toEqual(['', '-', 'a']);
    });

    it('lists no column for a series with no data, and keeps the others\' names', () => {
        const option = { xAxis: { data: ['a', 'b'] }, series: [{ data: [] }, { data: [1, 2] }, {}, { name: 'C', data: [3] }] };
        expect(tableOf(option)).toEqual({ head: ['', '2', 'C'], rows: [['a', '1', '3'], ['b', '2', '']] });
        expect(tableOf({ xAxis: { data: ['a'] }, series: [{ data: [] }] })).toBeNull();
    });

    it('holds a table to ten thousand cells, however small the option that asks for more', () => {
        const cells = (t: { head: string[]; rows: string[][] }): number => t.head.length + t.rows.reduce((n, r) => n + r.length, 0);
        // 10 000 empty series beside 1000 categories: one column, not ten million cells.
        const empty = tableOf({ xAxis: { data: Array.from({ length: 1000 }, (_, i) => i) }, series: [{ data: [1] }, ...Array.from({ length: 10000 }, () => ({ data: [] }))] })!;
        expect(empty.head).toHaveLength(2);
        expect(empty.cut).toBeUndefined();
        // 500 series of one point each, beside 1000 categories.
        const wide = tableOf({ xAxis: { data: Array.from({ length: 1000 }, (_, i) => i) }, series: Array.from({ length: 500 }, () => ({ data: [1] })) })!;
        expect(cells(wide)).toBeLessThanOrEqual(10000);
        expect(wide.cut).toBe(true);
        // A dataset row a hundred thousand values wide.
        const row = Array.from({ length: 100000 }, (_, i) => i);
        const dataset = tableOf({ dataset: { source: [row.map(String), row, row] } })!;
        expect(cells(dataset)).toBeLessThanOrEqual(10000);
        expect(dataset.cut).toBe(true);
        const objects = tableOf({ dataset: { source: Array.from({ length: 5000 }, () => Object.fromEntries(row.slice(0, 40).map((k) => [k, k]))) } })!;
        expect(cells(objects)).toBeLessThanOrEqual(10000);
        expect(objects.cut).toBe(true);
        const pie = tableOf({ series: [{ type: 'pie', data: Array.from({ length: 5000 }, (_, i) => ({ name: `n${i}`, value: i })) }] })!;
        expect(pie.rows).toHaveLength(1000);
        expect(pie.cut).toBe(true);
    });

    it('says nothing when the shape does not say what the numbers are', () => {
        expect(tableOf({ series: [{ type: 'scatter', data: [[1, 2], [3, 4]] }] })).toBeNull();
        expect(tableOf({ series: [{ type: 'line' }] })).toBeNull();
        expect(tableOf({ dataset: { source: [1, 2] } })).toBeNull();
        expect(tableOf({ series: [{ data: [{ x: () => 1 }] }], xAxis: { data: ['a'] } })).toEqual({ head: ['', '1'], rows: [['a', '']] });
    });
});
