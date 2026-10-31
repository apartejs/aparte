/**
 * The package entry imports `chart.js/auto` itself, on the first chart — stood in for
 * here, since the real one cannot draw on jsdom's canvas.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, renderCodeLanguages } from '@aparte/core';

const made: unknown[] = [];
vi.mock('chart.js/auto', () => ({
    default: class {
        constructor(_canvas: HTMLCanvasElement, config: unknown) { made.push(config); }
        update(): void {}
        resize(): void {}
        destroy(): void {}
    },
}));

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

describe('setupChartjs', () => {
    it('loads chart.js/auto on the first chart and draws with it', async () => {
        const { setupChartjs, CHARTJS_LANGUAGES } = await import('./index.js');
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
        const dispose = setupChartjs();
        expect(CHARTJS_LANGUAGES).toEqual(['chartjs', 'chart.js']);
        const root = document.createElement('div');
        root.innerHTML = '<pre><code class="language-chartjs">{"type":"bar","data":{"labels":["a"],"datasets":[{"data":[1]}]}}</code></pre>';
        document.body.appendChild(root);
        renderCodeLanguages(root);
        await vi.waitFor(() => expect(made).toHaveLength(1));
        expect(made[0]).toMatchObject({ type: 'bar', options: { responsive: false } });
        dispose();
    });
});
