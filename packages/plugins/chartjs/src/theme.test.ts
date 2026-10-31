/**
 * The chat's look as a Chart.js config — a pure function, checked in Node terms — and the
 * series palette it colours datasets from.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { themeChartjsConfig, readTokens, resetScratch, type ChartjsTokens } from './theme.js';
import { SERIES_HUES, parseColor, seriesPalette, withAlpha } from './palette.js';
import type { ChartjsConfig } from './source.js';

const tokens: ChartjsTokens = {
    text: '#111111', muted: '#666666', border: '#dddddd', surface: '#fafafa',
    background: '#ffffff', primary: '#3b5bdb', fontFamily: 'Inter, sans-serif',
};

const config = (type: string, datasets: Array<Record<string, unknown>> = [{ data: [1, 2] }], options?: Record<string, unknown>): ChartjsConfig =>
    ({ type, data: { labels: ['a', 'b'], datasets }, ...(options ? { options } : {}) });

afterEach(() => {
    vi.restoreAllMocks();
    resetScratch();
});

describe('themeChartjsConfig', () => {
    it('gives text, lines, the tooltip and the font the chat\'s tokens', () => {
        const o = themeChartjsConfig(config('bar'), tokens).options as Record<string, any>;
        expect(o['color']).toBe('#111111');
        expect(o['borderColor']).toBe('#dddddd');
        expect(o['font']).toEqual({ family: 'Inter, sans-serif' });
        expect(o['plugins'].legend.labels.color).toBe('#111111');
        expect(o['plugins'].title.color).toBe('#111111');
        expect(o['plugins'].subtitle.color).toBe('#666666');
        expect(o['plugins'].tooltip).toMatchObject({ backgroundColor: '#fafafa', titleColor: '#111111', bodyColor: '#111111', borderColor: '#dddddd', borderWidth: 1 });
        expect(o['scales'].x.grid.color).toBe('#dddddd');
        expect(o['scales'].y.ticks.color).toBe('#666666');
        expect(o['scales'].y.border.color).toBe('#dddddd');
        expect(o['scales'].x.title.color).toBe('#666666');
    });

    it('keeps every value the config sets itself', () => {
        const own = config('line', [{ data: [1], borderColor: 'red' }], {
            color: 'navy',
            font: { family: 'Georgia', size: 14 },
            plugins: { legend: { labels: { color: 'green' } }, tooltip: { backgroundColor: 'black' } },
            scales: { y: { grid: { color: 'pink' }, ticks: { color: 'teal' } } },
        });
        const o = themeChartjsConfig(own, tokens).options as Record<string, any>;
        expect(o['color']).toBe('navy');
        expect(o['font']).toEqual({ family: 'Georgia', size: 14 });
        expect(o['plugins'].legend.labels.color).toBe('green');
        expect(o['plugins'].tooltip.backgroundColor).toBe('black');
        expect(o['plugins'].tooltip.bodyColor).toBe('#111111');
        expect(o['scales'].y.grid.color).toBe('pink');
        expect(o['scales'].y.ticks.color).toBe('teal');
        // The x axis it did not name is still themed.
        expect(o['scales'].x.grid.color).toBe('#dddddd');
        const dataset = themeChartjsConfig(own, tokens).data.datasets[0]!;
        expect(dataset['borderColor']).toBe('red');
        expect(dataset['backgroundColor']).toBeUndefined();
    });

    it('leaves a value it cannot merge into as it is', () => {
        const o = themeChartjsConfig(config('bar', undefined, { plugins: { legend: false, tooltip: 'off' }, scales: { x: 'auto' } }), tokens).options as Record<string, any>;
        expect(o['plugins'].legend).toBe(false);
        expect(o['plugins'].tooltip).toBe('off');
        expect(o['scales'].x).toBe('auto');
    });

    it('returns a new config and leaves the one it was given untouched', () => {
        const input = config('bar');
        const before = JSON.stringify(input);
        const out = themeChartjsConfig(input, tokens);
        expect(JSON.stringify(input)).toBe(before);
        expect(out.data.datasets[0]).not.toBe(input.data.datasets[0]);
    });

    it('draws no axis on a pie, and a radial one on a radar or a polar area', () => {
        expect(themeChartjsConfig(config('pie'), tokens).options!['scales']).toBeUndefined();
        expect(themeChartjsConfig(config('doughnut'), tokens).options!['scales']).toBeUndefined();
        for (const type of ['radar', 'polarArea']) {
            const r = (themeChartjsConfig(config(type), tokens).options!['scales'] as Record<string, any>)['r'];
            expect(r.angleLines.color).toBe('#dddddd');
            expect(r.pointLabels.color).toBe('#111111');
            expect(r.ticks.backdropColor).toBe('#ffffff');
        }
        const named = themeChartjsConfig(config('bar', undefined, { scales: { speed: { type: 'radialLinear' } } }), tokens).options!['scales'] as Record<string, any>;
        expect(named['speed'].pointLabels.color).toBe('#111111');
    });

    it('colours each dataset by its series, the primary first', () => {
        const out = themeChartjsConfig(config('bar', [{ data: [1] }, { data: [2] }]), tokens).data.datasets;
        const palette = seriesPalette('#3b5bdb');
        expect(out[0]!['borderColor']).toBe('#3b5bdb');
        expect(out[0]!['backgroundColor']).toBe('rgba(59, 91, 219, 0.8)');
        expect(out[0]).toMatchObject({ borderWidth: 1, borderRadius: 4 });
        expect(out[1]!['borderColor']).toBe(palette[1]);
    });

    it('draws a line solid with a translucent area, and a mixed chart by each dataset\'s own type', () => {
        const out = themeChartjsConfig(config('bar', [{ data: [1] }, { type: 'line', data: [2] }]), tokens).data.datasets;
        expect(out[1]).toMatchObject({ borderColor: seriesPalette('#3b5bdb')[1], pointBackgroundColor: seriesPalette('#3b5bdb')[1], borderWidth: 2 });
        expect(String(out[1]!['backgroundColor'])).toMatch(/^rgba\(.*, 0\.2\)$/);
        const scatter = themeChartjsConfig(config('scatter'), tokens).data.datasets[0]!;
        expect(scatter['backgroundColor']).toBe('rgba(59, 91, 219, 0.6)');
    });

    it('gives a pie a colour per slice, with the page between them', () => {
        const pie = themeChartjsConfig(config('pie', [{ data: [1, 2, 3] }]), tokens).data.datasets[0]!;
        expect(pie['backgroundColor']).toEqual(seriesPalette('#3b5bdb').slice(0, 3).map((c) => withAlpha(c, 1)));
        expect(pie['borderColor']).toBe('#ffffff');
        expect(pie['borderWidth']).toBe(2);
        const polar = themeChartjsConfig(config('polarArea', [{ data: [1] }]), tokens).data.datasets[0]!;
        expect(polar['backgroundColor']).toEqual(['rgba(59, 91, 219, 0.7)']);
    });

    it('draws a series past the last hue in the muted colour, never a recycled hue', () => {
        const many = Array.from({ length: 10 }, () => ({ data: [1] }));
        const out = themeChartjsConfig(config('line', many), tokens).data.datasets;
        const palette = seriesPalette('#3b5bdb');
        expect(out[palette.length]!['borderColor']).toBe('#666666');
        expect(out[9]!['borderColor']).toBe('#666666');
        expect(new Set(out.slice(0, palette.length).map((d) => d['borderColor'])).size).toBe(palette.length);
    });
});

describe('seriesPalette', () => {
    // OKLab ΔE, the measure the palette is chosen by — recomputed here independently.
    const lab = (hex: string): number[] => {
        const [r, g, b] = parseColor(hex)!.map((c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
        const l = Math.cbrt(0.4122214708 * r! + 0.5363325363 * g! + 0.0514459929 * b!);
        const m = Math.cbrt(0.2119034982 * r! + 0.6806995451 * g! + 0.1073969566 * b!);
        const s = Math.cbrt(0.0883024619 * r! + 0.2817188376 * g! + 0.6299787005 * b!);
        return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
    };
    const dE = (a: string, b: string): number => { const [x, y] = [lab(a), lab(b)]; return 100 * Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!); };

    it.each(['#b07d33', '#d9a24b', '#3b5bdb', '#dc2626', '#16a34a', '#7c3aed', '#0d9488', '#ea580c'])(
        'starts with the primary %s, holds no hue it could be taken for, and keeps neighbours apart',
        (primary) => {
            const palette = seriesPalette(primary);
            expect(palette[0]).toBe(primary);
            expect(palette.length).toBeGreaterThanOrEqual(5);
            expect(palette.length).toBeLessThanOrEqual(8);
            for (const hue of palette.slice(1)) {
                expect(SERIES_HUES).toContain(hue);
                expect(dE(hue, primary)).toBeGreaterThanOrEqual(15);
            }
            for (let i = 1; i < palette.length; i++) expect(dE(palette[i]!, palette[i - 1]!)).toBeGreaterThanOrEqual(15);
        },
    );

    it('drops the orange and the yellow beside aparté\'s brass', () => {
        expect(seriesPalette('#b07d33')).not.toContain('#d95926');
        expect(seriesPalette('#b07d33')).not.toContain('#c98500');
    });

    it('reads an rgb() primary, and keeps one it cannot read first, before the fixed hues', () => {
        expect(seriesPalette('rgb(59, 91, 219)')[0]).toBe('rgb(59, 91, 219)');
        expect(seriesPalette('oklch(0.6 0.1 30)')).toEqual(['oklch(0.6 0.1 30)', ...SERIES_HUES.slice(0, 7)]);
    });

    it('is the same list for the same primary', () => {
        expect(seriesPalette('#123456')).toBe(seriesPalette('#123456'));
    });
});

describe('colours', () => {
    it('reads #rgb, #rrggbb and rgb(), and adds an alpha only to what it read', () => {
        expect(parseColor('#abc')).toEqual([170, 187, 204]);
        expect(parseColor('rgba(1, 2, 3, 0.5)')).toEqual([1, 2, 3]);
        expect(parseColor('red')).toBeNull();
        expect(withAlpha('#000000', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
        expect(withAlpha('color-mix(in srgb, red, blue)', 0.5)).toBe('color-mix(in srgb, red, blue)');
    });
});

describe('readTokens', () => {
    it('resolves each token through the browser and a canvas, beside the chart, not in it', () => {
        const fake = { _v: '#000000', get fillStyle() { return this._v; }, set fillStyle(v: string) { this._v = v === 'rgb(1, 2, 3)' ? '#010203' : '#000000'; } };
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fake as unknown as CanvasRenderingContext2D);
        vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({ color: 'rgb(1, 2, 3)', fontFamily: 'Inter' }) as CSSStyleDeclaration);
        const host = document.createElement('div');
        document.body.appendChild(host);
        const t = readTokens(host);
        expect(t).toEqual({ text: '#010203', muted: '#010203', border: '#010203', surface: '#010203', background: '#010203', primary: '#010203', fontFamily: 'Inter' });
        expect(host.childNodes).toHaveLength(0);
        host.remove();
    });

    it('keeps the computed colour when there is no canvas, and a fallback font', () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
        vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({ color: 'rgb(9, 9, 9)', fontFamily: '' }) as CSSStyleDeclaration);
        const t = readTokens(document.createElement('div'));
        expect(t.text).toBe('rgb(9, 9, 9)');
        expect(t.fontFamily).toBe('system-ui, sans-serif');
    });

    it('falls back to its defaults when a token cannot be computed', () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
        vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({ color: '', fontFamily: 'X' }) as CSSStyleDeclaration);
        expect(readTokens(document.createElement('div')).primary).toBe('#3b5bdb');
    });

    it('has its defaults with no getComputedStyle at all', () => {
        vi.stubGlobal('getComputedStyle', undefined);
        try {
            expect(readTokens(document.createElement('div'))).toMatchObject({ text: '#1a1a1a', fontFamily: 'system-ui, sans-serif' });
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
