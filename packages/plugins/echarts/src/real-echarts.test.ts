/**
 * The real ECharts, rendering to an SVG string (its server-side mode needs no layout): what
 * the stand-in cannot say — that the theme sits under the option, so the option's own
 * colours win, and that a sanitized option draws no picture, no HTML and no link.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as echarts from 'echarts';
import { echartsTheme, sanitizeEChartsOption } from './core.js';

beforeAll(() => {
    // jsdom has no canvas to measure text with.
    echarts.setPlatformAPI({ measureText: (text: string) => ({ width: text.length * 7 }) });
});

const TOKENS = { text: '#241f2b', muted: '#6d6479', border: '#e5ddce', surface: '#fffdf8', background: '#f6f2ea', primary: '#b07d33' };

function draw(option: Record<string, unknown>): string {
    const chart = echarts.init(null, echartsTheme(TOKENS), { renderer: 'svg', ssr: true, width: 400, height: 300 });
    chart.setOption({ ...option, animation: false });
    const svg = chart.renderToSVGString();
    chart.dispose();
    return svg;
}

describe('the real ECharts', () => {
    it('draws in the chat\'s colours, and the option\'s own colours win', () => {
        const svg = draw({
            title: { text: 'Sales' },
            xAxis: { data: ['a', 'b'] },
            yAxis: {},
            series: [{ type: 'bar', data: [1, 2] }, { type: 'bar', data: [3, 4], itemStyle: { color: '#ff0000' } }],
        });
        // The first series in the primary, the title in the text colour.
        expect(svg).toContain('fill="#b07d33"');
        expect(svg).toContain('fill="#241f2b"');
        // The second series asked for red, and got it over the palette.
        expect(svg).toContain('fill="#ff0000"');
        expect(svg).not.toContain('#e87ba4');
    });

    it('draws no picture and no link from a model\'s option', () => {
        const option = sanitizeEChartsOption({
            title: { text: 'T', link: 'javascript:alert(1)' },
            backgroundColor: { image: 'https://evil.test/bg.png' },
            legend: { data: ['s'], icon: 'image://https://evil.test/icon.png' },
            graphic: [{ type: 'image', style: { image: 'https://evil.test/g.png', width: 10, height: 10 } }],
            xAxis: { data: ['a'] },
            yAxis: {},
            series: [{ name: 's', type: 'line', symbol: 'image://https://evil.test/s.png', data: [1], itemStyle: { color: 'url(https://evil.test/p.svg#p)' } }],
        })!;
        const svg = draw(option);
        expect(svg).not.toContain('evil.test');
        expect(svg).not.toMatch(/<image/);
    });

    it('writes no escaped url() into a fill or a stroke', () => {
        // Unsanitized, ECharts copies each of these into `fill="…"` verbatim, and CSS reads
        // every one as `url(`: the browser would fetch the address.
        const forms = [String.raw`u\rl(https://evil.test/a.svg#a)`, String.raw`u\72 l(https://evil.test/b.svg#b)`, String.raw`\75 rl(https://evil.test/c.svg#c)`];
        const raw = (evil: string) => ({
            xAxis: { type: 'category', data: ['a', 'b'] },
            yAxis: {},
            series: [{ type: 'bar', data: [1, 2], itemStyle: { color: evil, borderColor: evil, borderWidth: 2 } }],
            graphic: [{ type: 'rect', shape: { width: 10, height: 10 }, style: { fill: evil, stroke: evil } }],
        });
        // The case is real: without the sanitizer, the attribute carries it.
        expect(draw(raw(forms[0]!))).toMatch(/(fill|stroke)="u\\rl\(/);
        for (const evil of forms) {
            const svg = draw(sanitizeEChartsOption(raw(evil))!);
            expect(svg, evil).not.toContain('evil.test');
            expect(svg.match(/(fill|stroke)="[^"]*"/g)!.every((attr) => !attr.includes('\\') && !/url/i.test(attr)), evil).toBe(true);
        }
    });
});
