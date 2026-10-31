# @aparte/plugin-echarts

Charts for [aparté](https://github.com/apartejs/aparte) via [Apache ECharts](https://echarts.apache.org).
Every ```` ```echarts ```` fence in a reply — an ECharts `option` as JSON — is drawn as a chart, as
it streams, whichever Markdown provider is installed, or none. A tool whose result is an option
can be drawn the same way, in place of its row.

```bash
npm install @aparte/plugin-echarts @aparte/core echarts
```

```ts
import { setupECharts } from '@aparte/plugin-echarts';

setupECharts();
```

`@aparte/core` and `echarts` (6.0 or later) are **peer dependencies**. ECharts is loaded on the
first chart, not before, and a chart is drawn only once it comes near the screen, so reopening a
long conversation stays fast.

## The fence

The body is ECharts' own `option`, as JSON — nothing new to learn, and what a model already
knows from ECharts' documentation. `echart` works as the language too.

````md
```echarts
{
  "title": { "text": "Sales by month" },
  "tooltip": { "trigger": "axis" },
  "xAxis": { "type": "category", "data": ["Jan", "Feb", "Mar"] },
  "yAxis": { "type": "value" },
  "series": [{ "name": "Sales", "type": "bar", "data": [120, 200, 150] }]
}
```
````

While the reply streams, the chart is drawn from the part of the JSON that has arrived — its
last whole value, brackets closed — at most every 300 ms, so the bars appear as their numbers
do; each frame updates the same chart. Once the fence closes, one that is not valid JSON — or is,
but has no `series` and no `dataset` to draw — shows a note and its source.

## A tool's result

```ts
setupECharts({
  tool: 'plot_sales',                        // a name, a RegExp, or an array of them
  map: (result, input) => ({                 // optional: your tool's data → an ECharts option
    title: { text: String(input.metric) },
    xAxis: { type: 'category', data: result.months },
    yAxis: {},
    series: [{ type: 'line', data: result.values }],
  }),
});
```

Without `map`, the result itself is the option: its `structuredContent` when it has one, else its
text read as JSON. While the tool runs, a quiet box stands where the chart will be; waiting for
approval, refused, stopped or failed, a one-line note says so.

## The chat's colours

The chart takes its look from the chat's tokens — text (`--aparte-text`), axis labels
(`--aparte-text-muted`), axis and grid lines (`--aparte-border`), the tooltip's ground
(`--aparte-surface-1`), the font (`--aparte-font-family`), a transparent background — as an
ECharts **theme**, so anything the option sets itself wins over it. A light/dark switch recolours
the chart in place (`setTheme`), without drawing it again.

The series colours start with `--aparte-primary`, then eight hues validated for colour-vision
deficiency (each adjacent pair at least 8 ΔE in OKLab ×100 under protanopia, deuteranopia and
tritanopia, 15 for full colour vision), stepped once for a light ground and once for a dark one
so a series keeps its hue across the switch. The primary takes the place of the hue nearest to
it — a brass primary replaces the yellow — so no two look alike side by side. They are
`ECHARTS_SERIES_HUES`; `echartsPalette(primary, dark)` gives the order.

`echartsTheme(tokens)` is the theme itself, pure — the same tokens make the same theme, in Node
as in a browser — for a chart of your own that should look like the chat's:

```ts
import * as echarts from 'echarts';
import { echartsTheme, type EChartsTokens } from '@aparte/plugin-echarts';

const tokens: EChartsTokens = {
  text: '#241f2b', muted: '#6d6479', border: '#e5ddce',
  surface: '#fffdf8', background: '#f6f2ea', primary: '#b07d33',
};
echarts.init(document.getElementById('my-chart')!, echartsTheme(tokens), { renderer: 'svg' });
```

## Size, motion, screen readers

The chart fills the bubble's width, up to 40rem, at `height` (18rem by default), and follows its
box as it resizes. It is drawn with ECharts' SVG renderer: crisp at any zoom, and its text is
real text. Under `prefers-reduced-motion` nothing moves: animation is off at the root, on every
series, on `graphic` and in a `baseOption`, a timeline does not play itself, an `effectScatter`
ripples only on hover and a `lines` trail is not drawn.

It is a `figure` named by the option's `title.text`, else "Chart". Inside it, ECharts' own
description is on (`aria.enabled`, in the chat's language when that language is registered with
ECharts, English otherwise) in the plugin's own settings — an option cannot turn its label off or
replace it with a `description` of its own; only its `aria.decal` is kept. A visually hidden table
holds the numbers when the option says plainly what they are: a `dataset` (its first row a header
the way ECharts reads `sourceHeader`), a category axis with its series, or a pie's named values. A
series with no data has no column, and the table stops at 1000 rows, 50 columns and 10 000 cells,
whatever the option asks — a last line, hidden too, says when it lists only part of the data.

Its words follow the chat's language (ten of them built in) and can be set with `extendLocale()`:

```ts
aparteGlobalConfig.extendLocale({
  echartsChart: 'Chart',                           // the name of an untitled chart
  echartsError: 'This chart could not be drawn.',
  echartsLoading: 'Loading chart',
  echartsWaiting: 'Waiting for your approval',
  echartsNotRun: 'No chart: the tool did not run.',
  echartsFailed: 'No chart: the tool failed.',
  echartsTableCut: 'Only part of the data is listed.', // the hidden table's last line, when it is cut
});
```

## Options

`setupECharts(options?, config?)` takes `EChartsOptions`:

| option | default | |
| --- | --- | --- |
| `progressive` | `true` | `false` draws a chart once its fence has closed |
| `height` | `'18rem'` | pixels, or a CSS length |
| `renderer` | `'svg'` | `'canvas'` for a chart of tens of thousands of points |
| `tool` | — | the tool(s) whose result is an option |
| `map` | — | `(result, input) => option` |

Both setup functions return a disposer that unregisters the renderers, stops watching the theme
and disposes every chart they drew.

## What a model's option cannot do

The option comes from a model or a tool, so `sanitizeEChartsOption(option)` takes out whatever
ECharts would turn into HTML, a request or a navigation before it is drawn — and only that:

- **Tooltips are drawn, never written as HTML.** Every `tooltip` (the root's, a series', a data
  item's) is forced to `renderMode: 'richText'`, and the HTML-only `extraCssText`, `className`,
  `appendTo` and `appendToBody` go. A string `formatter` stays: in rich-text mode ECharts draws it
  as text, so `<b>` shows as `<b>`.
- **No download, no HTML panel.** `toolbox.feature.saveAsImage` (a download, or a new tab) and
  `toolbox.feature.dataView` (an HTML table with a textarea) go.
- **No pictures.** A `graphic` element of `type: 'image'`, any value with an `image` (a picture
  fill, a rich-text background) or an `svgElement` (an SVG pattern ECharts builds node by node —
  a `<script>` would run), any `image://…` string (a symbol, a legend or handle icon), and any
  string holding a CSS `url(…)` (a fill pointing at another document) go — read with its CSS
  escapes decoded, since a fill takes `u\rl(` as `url(`; any string pairing a backslash with a
  bracket goes too.
- **Only colours where a colour goes.** ECharts copies a `color`, `fill`, `stroke` or any `…Color`
  into an SVG attribute as it is, so there only colour syntax stays: a name, `#hex`, or `rgb()` /
  `rgba()` / `hsl()` / `hsla()` of numbers. A gradient is an object ECharts builds itself; its
  stops are checked the same way.
- **No regular expression.** A dataset `filter` transform's `reg` is compiled and run on every
  value, and a pattern can backtrack for minutes (`^(a+)+$`), so every `reg` goes.
- **No links.** A string `link` or `sublink` (a title, a treemap or sunburst node — ECharts opens
  it on a click, and `javascript:` would run in the page) goes.
- **No CSS through a font.** ECharts writes `fontFamily`, `fontSize`, `fontStyle`, `fontWeight`
  and `font` into a `style` attribute; a value with anything beyond a font name in it goes.
- `__proto__`, `constructor` and `prototype` keys go.

Functions cannot arrive in JSON, so a `formatter` or `renderItem` callback never does. The option
reaches the page's markup once, as the escaped value of an attribute on the chart's element (a fence
hands core markup, not a node); ECharts draws it into that element, and the table's cells are
written as text.

## Two entry points

`@aparte/plugin-echarts` imports the full ECharts build on the first chart. To hand over your
own — a smaller build with only the charts you use — import from the entry that imports nothing
from `echarts`:

```ts
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  AriaComponent, DatasetComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { setupEChartsWith } from '@aparte/plugin-echarts/core';

// `AriaComponent` and `SVGRenderer` are what the plugin itself uses.
echarts.use([
  BarChart, LineChart, PieChart,
  AriaComponent, DatasetComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent,
  SVGRenderer,
]);
setupEChartsWith(echarts);
```

`setupEChartsWith` takes the module, or a function returning a promise of it, and any object
shaped like `EChartsLike` (`init`, returning an `EChartsInstanceLike`: `setOption`, `setTheme`,
`resize`, `dispose`). A chart whose series type your build lacks shows the note. The `/core`
entry exports the same helpers and types: `sanitizeEChartsOption`, `echartsTheme`,
`echartsPalette`, `ECHARTS_SERIES_HUES`, `EChartsOption`, `EChartsTokens`, `EChartsOptions`.

ESM only.
