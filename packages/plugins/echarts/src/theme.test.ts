/**
 * The chat's look as an ECharts theme: built from tokens alone, so checked in Node; and
 * the tokens as the browser resolves them, stood in for where jsdom cannot.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ECHARTS_SERIES_HUES, echartsPalette, echartsTheme, isDark, readTokens, rgbOf, type EChartsTokens } from './theme.js';

const LIGHT: EChartsTokens = {
    text: '#241f2b', muted: '#6d6479', border: '#e5ddce', surface: '#fffdf8', background: '#f6f2ea', primary: '#b07d33',
    fontFamily: 'system-ui, -apple-system, sans-serif',
};
const DARK: EChartsTokens = { ...LIGHT, text: '#f2eee7', muted: '#a89bb6', border: '#342a40', surface: '#211b28', background: '#17141c', primary: '#d9a24b' };

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('rgbOf', () => {
    it('reads hex and rgb() / rgba() in both syntaxes', () => {
        expect(rgbOf('#abc')).toEqual([170, 187, 204]);
        expect(rgbOf('#b07d33')).toEqual([176, 125, 51]);
        expect(rgbOf('#b07d33ff')).toEqual([176, 125, 51]);
        expect(rgbOf('rgb(1, 2, 3)')).toEqual([1, 2, 3]);
        expect(rgbOf('rgba(1 2 3 / 50%)')).toEqual([1, 2, 3]);
        expect(rgbOf('oklch(0.7 0.1 80)')).toBeNull();
    });
});

describe('isDark', () => {
    it('tells a dark ground from a light one, and reads an unknown one as light', () => {
        expect(isDark('#17141c')).toBe(true);
        expect(isDark('#f6f2ea')).toBe(false);
        expect(isDark('transparent')).toBe(false);
    });
});

describe('echartsPalette', () => {
    it('puts the primary first, in place of the hue nearest to it, and reads the ring on from there', () => {
        // aparté's brass sits nearest the yellow: it takes its place, so the two never stand side by side.
        expect(echartsPalette('#b07d33')).toEqual(['#b07d33', '#e87ba4', '#008300', '#6250d6', '#e34948', '#2a78d6', '#eb6834', '#1baf7a']);
        // A blue primary takes the blue's place: the validated order, unchanged.
        expect(echartsPalette('#2a78d6')).toEqual(['#2a78d6', ...ECHARTS_SERIES_HUES.light.slice(1)]);
    });

    it('steps the hues for a dark ground', () => {
        expect(echartsPalette('#3987e5', true)).toEqual(['#3987e5', ...ECHARTS_SERIES_HUES.dark.slice(1)]);
    });

    it('keeps the whole ring behind a primary it cannot read', () => {
        expect(echartsPalette('oklch(0.7 0.1 80)')).toEqual(['oklch(0.7 0.1 80)', ...ECHARTS_SERIES_HUES.light]);
    });
});

describe('echartsTheme', () => {
    it('makes the chat\'s look an ECharts theme', () => {
        const theme = echartsTheme(LIGHT) as Record<string, any>;
        expect(theme['darkMode']).toBe(false);
        expect(theme['backgroundColor']).toBe('transparent');
        expect(theme['color'][0]).toBe('#b07d33');
        expect(theme['textStyle']).toEqual({ color: '#241f2b', fontFamily: 'system-ui, -apple-system, sans-serif' });
        expect(theme['title'].subtextStyle.color).toBe('#6d6479');
        expect(theme['tooltip']).toEqual({ backgroundColor: '#fffdf8', borderColor: '#e5ddce', textStyle: { color: '#241f2b' } });
        expect(theme['valueAxis'].axisLabel.color).toBe('#6d6479');
        expect(theme['valueAxis'].splitLine).toEqual({ show: true, lineStyle: { color: '#e5ddce' } });
        expect(theme['categoryAxis'].splitLine.show).toBe(false);
        expect(theme['legend'].textStyle.color).toBe('#241f2b');
        expect(theme['pie'].itemStyle.borderColor).toBe('#f6f2ea');
    });

    it('reads dark from the ground, unless told', () => {
        const dark = echartsTheme(DARK) as Record<string, any>;
        expect(dark['darkMode']).toBe(true);
        expect(dark['color'].slice(1)).toEqual(expect.arrayContaining(['#9085e9']));
        expect((echartsTheme({ ...DARK, dark: false }) as Record<string, any>)['darkMode']).toBe(false);
    });

    it('leaves the font to ECharts when the token is not a plain font name', () => {
        expect((echartsTheme({ ...LIGHT, fontFamily: 'x; fill: url(a)' }) as Record<string, any>)['textStyle']).toEqual({ color: '#241f2b' });
        expect((echartsTheme({ ...LIGHT, fontFamily: undefined }) as Record<string, any>)['textStyle']).toEqual({ color: '#241f2b' });
    });
});

describe('readTokens', () => {
    it('resolves each token through the browser and a one-pixel canvas', () => {
        // jsdom takes no `var()`: stand in for the browser's computed colour, and for the
        // canvas that turns any colour it understands into pixels.
        let painted = '';
        const paint = {
            clearRect: () => {},
            fillRect: () => {},
            set fillStyle(v: string) { painted = v; },
            get fillStyle() { return painted; },
            getImageData: () => ({ data: painted === 'rgb(9, 9, 9)' ? [9, 9, 9, 128] : [200, 100, 50, 255] }),
        };
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(paint as unknown as CanvasRenderingContext2D);
        const real = window.getComputedStyle.bind(window);
        // The chat's style is read first, then the probe once per token: the border is the third.
        let reads = 0;
        vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
            const style = real(el);
            const read = reads++;
            return new Proxy(style, {
                get(target, key) {
                    if (key === 'color') return read === 3 ? 'rgb(9, 9, 9)' : 'oklch(0.7 0.1 80)';
                    if (key === 'getPropertyValue') return (name: string) => (name === '--aparte-font-family' ? ' Inter, sans-serif ' : '');
                    const v = Reflect.get(target, key);
                    return typeof v === 'function' ? v.bind(target) : v;
                },
            });
        });
        const el = document.createElement('div');
        document.body.appendChild(el);
        const tokens = readTokens(el);
        expect(tokens.text).toBe('rgb(200, 100, 50)');
        expect(tokens.border).toBe('rgba(9, 9, 9, 0.502)');
        expect(tokens.fontFamily).toBe('Inter, sans-serif');
        // The probe was taken away again.
        expect(el.childNodes).toHaveLength(0);
    });

    it('keeps the computed colours where there is no canvas, and the fallbacks where there is nothing', () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
        vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({ color: '', fontFamily: '', getPropertyValue: () => '' }) as unknown as CSSStyleDeclaration);
        const el = document.createElement('div');
        const tokens = readTokens(el);
        expect(tokens).toEqual({ text: '#1a1a1a', muted: '#666666', border: '#d0d0d0', surface: '#fafafa', background: '#ffffff', primary: '#3b5bdb' });
    });
});

describe('echartsPalette with a grey primary', () => {
    it('places a hueless primary by plain distance', () => {
        const palette = echartsPalette('#808080');
        expect(palette[0]).toBe('#808080');
        expect(palette).toHaveLength(8);
    });
});
