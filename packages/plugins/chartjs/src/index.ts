import { aparteGlobalConfig, type AparteConfig } from '@aparte/core';
import { setupChartjsWith, type ChartjsOptions } from './core.js';

export {
    setupChartjsWith,
    themeChartjsConfig,
    readChartConfig,
    seriesPalette,
    SERIES_HUES,
    CHARTJS_LANGUAGES,
} from './core.js';
export type {
    ChartjsChart,
    ChartjsConfig,
    ChartjsConstructor,
    ChartjsLoader,
    ChartjsOptions,
    ChartjsTokens,
} from './core.js';

/**
 * Draw charts with [Chart.js](https://www.chartjs.org): every ```` ```chartjs ```` (or
 * ```` ```chart.js ````) fence in a reply whose body is a Chart.js config as JSON —
 * whichever Markdown provider is installed, or none — and, with `options.tool`, the
 * result of the tools named there. A chart is redrawn as its fence arrives, from the
 * part of its JSON that has arrived; once the fence closes, one that is not a chart
 * shows a note and its source.
 *
 * The chart takes the chat's colours and font wherever its config leaves them out, and
 * follows a light/dark switch in place. Chart.js (`chart.js/auto`, every chart type
 * registered) is loaded on the first chart, and a chart is drawn only once it comes near
 * the screen, so reopening a long conversation stays fast.
 *
 * @returns a disposer that unregisters the renderers and releases every chart drawn.
 * @example
 * import { setupChartjs } from '@aparte/plugin-chartjs';
 * setupChartjs({ tool: 'plot_sales' });
 */
export function setupChartjs(options: ChartjsOptions = {}, config: AparteConfig = aparteGlobalConfig): () => void {
    return setupChartjsWith(() => import('chart.js/auto'), options, config);
}
