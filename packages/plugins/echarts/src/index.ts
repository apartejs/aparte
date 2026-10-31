import { aparteGlobalConfig, type AparteConfig } from '@aparte/core';
import { setupEChartsWith, type EChartsOptions } from './core.js';

export { setupEChartsWith, sanitizeEChartsOption, echartsTheme, echartsPalette, ECHARTS_SERIES_HUES } from './core.js';
export type { EChartsLike, EChartsInstanceLike, EChartsOptions, EChartsOption, EChartsTokens } from './core.js';

/**
 * Draw charts with [Apache ECharts](https://echarts.apache.org): every ```` ```echarts ````
 * fence in a reply — an ECharts `option` as JSON — whichever Markdown provider is
 * installed, or none, and, with `tool`, a tool whose result is one. The chart is drawn as
 * its fence arrives, from the part of the JSON that has; once the fence closes, one that is
 * not an option shows a note and its source.
 *
 * Its colours and font come from the chat's theme and follow a light/dark switch; it is
 * drawn as SVG, without HTML tooltips, images, links or downloads a model could steer.
 * ECharts is loaded on the first chart, and a chart is drawn only once it comes near the
 * screen, so reopening a long conversation stays fast.
 *
 * @returns a disposer that unregisters the renderers and disposes the charts.
 * @example
 * import { setupECharts } from '@aparte/plugin-echarts';
 * setupECharts();
 */
export function setupECharts(options: EChartsOptions = {}, config: AparteConfig = aparteGlobalConfig): () => void {
    return setupEChartsWith(
        () => import('echarts'),
        options,
        config,
    );
}
