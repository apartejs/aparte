/**
 * The package entry imports ECharts itself, on the first chart — stood in for here, since
 * the real one cannot size a chart in jsdom.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, renderCodeLanguages } from '@aparte/core';

const inits: HTMLElement[] = [];
vi.mock('echarts', () => ({
    init: (dom: HTMLElement) => {
        inits.push(dom);
        return { setOption: () => {}, setTheme: () => {}, resize: () => {}, dispose: () => {} };
    },
}));

afterEach(() => { aparteGlobalConfig.reset(); document.body.innerHTML = ''; });

describe('setupECharts', () => {
    it('loads echarts on the first chart and draws with it', async () => {
        const { setupECharts, sanitizeEChartsOption, echartsTheme, echartsPalette, ECHARTS_SERIES_HUES } = await import('./index.js');
        expect([sanitizeEChartsOption, echartsTheme, echartsPalette].every((f) => typeof f === 'function')).toBe(true);
        expect(ECHARTS_SERIES_HUES.light).toHaveLength(8);
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
        const dispose = setupECharts();
        const root = document.createElement('div');
        root.innerHTML = '<pre><code class="language-echarts">{"series": [{"type": "bar", "data": [1]}]}</code></pre>';
        document.body.appendChild(root);
        renderCodeLanguages(root);
        await vi.waitFor(() => expect(inits).toHaveLength(1));
        expect(inits[0]!.closest('aparte-echarts')).not.toBeNull();
        dispose();
    });
});
