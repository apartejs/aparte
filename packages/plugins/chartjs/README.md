# @aparte/plugin-chartjs

Charts for [aparté](https://github.com/apartejs/aparte) via [Chart.js](https://www.chartjs.org).
A Chart.js config that a model writes in a ```` ```chartjs ```` fence, or that a tool returns, is
drawn as a chart — as it streams, whichever Markdown provider is installed, or none.

```bash
npm install @aparte/plugin-chartjs @aparte/core chart.js
```

```ts
import { setupChartjs } from '@aparte/plugin-chartjs';

setupChartjs();
```

`@aparte/core` and `chart.js` (4.4 or later, below 5) are **peer dependencies**. Chart.js is
loaded on the first chart, not before, and a chart is drawn only once it comes near the screen,
so reopening a long conversation stays fast.

## The fence

The body is Chart.js' own config, `{ type, data, options }`, as JSON — nothing new for a model to
learn. Both ```` ```chartjs ```` and ```` ```chart.js ```` are drawn (`CHARTJS_LANGUAGES`).

````md
```chartjs
{
  "type": "bar",
  "data": {
    "labels": ["Jan", "Feb", "Mar"],
    "datasets": [{ "label": "Sales", "data": [12, 19, 7] }]
  },
  "options": { "plugins": { "title": { "display": true, "text": "Sales by month" } } }
}
```
````

While a reply streams, the chart is redrawn from the part of its JSON that has arrived — at most
every 300 ms, and only when what has arrived changes the chart — so its bars or points appear as
the model writes them. Before its first point it is a quiet box the size the chart will be. Once
the fence closes, a body that is not a chart shows a note and its source.

## A tool that returns a chart

Name the tools whose result is a Chart.js config, and the chart is drawn in place of the tool's
row: its `structuredContent`, else its text read as JSON. A quiet box shows while the call runs;
a call refused or failed shows one line instead.

```ts
setupChartjs({ tool: ['plot_sales', /^chart_/] });
```

A tool that returns its own data rather than a chart takes a `map` — the result and the call's
input in, a Chart.js config out:

```ts
setupChartjs({
  tool: 'get_revenue',
  map: (result, input) => {
    const rows = result as Array<{ month: string; total: number }>;
    return {
      type: 'line',
      data: {
        labels: rows.map((r) => r.month),
        datasets: [{ label: String(input.region ?? 'Revenue'), data: rows.map((r) => r.total) }],
      },
    };
  },
});
```

## The chat's look

Wherever a config leaves them out, a chart takes the chat's tokens: text in `--aparte-text`, axis
ticks and titles in `--aparte-text-muted`, grid and axis lines in `--aparte-border`, the tooltip on
`--aparte-surface-1`, the chat's font, and a transparent background. Every value the config sets
itself wins. A light/dark switch (`data-aparte-theme`, or the system's colour scheme) re-themes
each chart in place, without drawing it again.

A dataset with no colour of its own is coloured by its series: `--aparte-primary` first, then a
fixed set of eight hues chosen to read on light and dark alike (blue, orange, aqua, yellow, magenta,
green, violet, red — `SERIES_HUES`). A hue the primary could be taken for is dropped, and each next
series is the first hue clearly apart from the one before it, under normal vision and under
simulated protanopia and deuteranopia. A series past the last hue is drawn in the muted text
colour rather than a recycled one: group such series ("Other") instead. `seriesPalette(primary)`
returns that list.

The same theming is a pure function, so you can check a config — or theme one for a chart of your
own — without a DOM:

```ts
import { themeChartjsConfig, seriesPalette } from '@aparte/plugin-chartjs';

const config = { type: 'bar', data: { labels: ['Jan', 'Feb'], datasets: [{ data: [12, 19] }] } };
const themed = themeChartjsConfig(config, {
  text: '#241f2b', muted: '#6d6479', border: '#e5ddce', surface: '#fffdf8',
  background: '#f6f2ea', primary: '#b07d33', fontFamily: 'Inter, sans-serif',
});
seriesPalette('#b07d33'); // ['#b07d33', '#2a78d6', '#199e70', …]
```

`ChartjsTokens` is the shape of that second argument.

## Size

A chart fills the bubble's width, up to `40rem`, at a height of `18rem`. Set the height with the
`height` option, or with CSS on the custom properties the plugin reads:

```css
.aparte-chartjs {
  --aparte-chartjs-height: 22rem;
  --aparte-chartjs-max-width: 48rem;
}
```

A config that sets `aspectRatio` (held between 1:4 and 4:1) or `maintainAspectRatio: true` is as
tall as its width says instead. The plugin fits each chart to its frame itself, with one
`ResizeObserver` for all of them, and releases a chart (`chart.destroy()`) once it has left the
page — Chart.js' own `responsive` mode puts an observer on the whole document per chart and keeps a
chart taken off the page until it is destroyed. A chart whose message comes back later (a list
that virtualises its rows, a conversation reopened) is drawn again as soon as it has a size; the
last 32 released are watched for that. A config that says `responsive: false` keeps the size
Chart.js gives it.

## Accessibility

A chart is a `figure` — the same shape as an `@aparte/plugin-echarts` chart — named by its title
(`options.plugins.title.text`), else "Chart" in the chat's language. In it, the canvas is
`role="img"` with the same name, and beside the canvas, visually hidden, is its data as a table — a
row per label, a column per dataset with data — for a screen reader. (Not inside the canvas as
fallback content: an image's children are presentational, so a screen reader would never reach a
table there.) The table stops at 50 dataset columns and 10 000 cells, whatever the config asks; a
last line, hidden too, says when it lists only part of the data. Under `prefers-reduced-motion`,
nothing animates. A chart still arriving never does, nor does the chart it settles into unless its
config asks for an animation — and no animation loops forever: `loop` is dropped from every
animation a config sets.

The words it draws read off the locale with defaults in ten languages; set any of them with
`extendLocale()`:

```ts
aparteGlobalConfig.extendLocale({
  chartjsChart: 'Figure',                          // the name of a chart with no title
  chartjsError: 'This chart could not be drawn.',  // the note over a fence that is not a chart
  chartjsUnavailable: 'Chart not available',       // a chart tool refused or failed
  chartjsSeries: 'Series {n}',                     // a table column for a dataset with no label
  chartjsTableCut: 'Only part of the data is listed.', // the table's last line, when it is cut
});
```

## Security

The config comes from a model or a tool, so it is treated as untrusted data:

- **Nothing in it becomes HTML.** Chart.js draws titles, labels and tooltips on the canvas. The
  config reaches the page's markup once, as the escaped value of an attribute on the chart's
  element (a fence hands core markup, not a node), and the data table is written with every value
  escaped.
- **No code can arrive.** JSON carries no function, so no callback, scriptable option or tooltip
  `external` handler can be passed — and where Chart.js CALLS what it finds, on every hover, a
  string in its place goes: the tooltip's `external`, `filter`, `itemSort` and `callbacks`, the
  legend labels' `generateLabels`, `filter` and `sort`, and a tooltip `position` other than
  `average` or `nearest`. The config's own `plugins` list is dropped entirely: Chart.js runs each
  entry's hooks, and an entry from JSON is an object with no function in it, so the list can do
  nothing and is not handed over. Options for the plugins *you* registered
  (`options.plugins.legend`, `.title`, `.tooltip`) are kept.
- **No image, no request.** A `pointStyle` is drawn as an image only when it is an
  `HTMLImageElement` or a canvas, which only code can make. Keys Chart.js would call on such an
  object (`toString`, `valueOf`) are dropped, as are `__proto__`, `prototype` and `constructor`.
- **Nothing the browser cannot allocate.** `options.devicePixelRatio` is dropped,
  `options.aspectRatio` is held to 1:4–4:1, a scale's `ticks.count` and `ticks.maxTicksLimit` to
  100 (Chart.js makes as many ticks as `count` says), a chart may carry at most 5000 points — and
  at most 5000 labels and 5000 datasets (`maxPoints` bounds all three) — and a locale `Intl`
  refuses is dropped rather than left to throw on every tick.

A config Chart.js still refuses — a type your `Chart` has not registered, a time scale with no
date adapter — shows the note, and warns once in the console.

## Options

`setupChartjs(options?, config?)` takes `ChartjsOptions`:

| option | default | |
| --- | --- | --- |
| `progressive` | `true` | `false` draws a chart once its fence has closed |
| `height` | `'18rem'` | the chart's height, as a CSS length |
| `tool` | — | tools whose result is drawn as a chart: a name, a RegExp, or a list |
| `map` | — | `(result, input) => config`, for a tool that returns its own data |
| `maxPoints` | `5000` | the most data points a chart may carry, all datasets together — and the most labels, and datasets |

`readChartConfig(value)` is the reader both paths use: the config copied and made harmless as
above, or `null` when it is not one Chart.js could draw. `ChartjsConfig` is its type.

## Two entry points

`@aparte/plugin-chartjs` imports `chart.js/auto` — every chart type, scale and plugin registered —
on the first chart. To ship only what your charts use, register those parts on Chart.js' `Chart`
and hand it over through the entry that imports nothing from `chart.js`:

```ts
import {
  Chart, BarController, LineController, BarElement, LineElement, PointElement,
  CategoryScale, LinearScale, Legend, Title, Tooltip,
} from 'chart.js';
import { setupChartjsWith } from '@aparte/plugin-chartjs/core';

Chart.register(
  BarController, LineController, BarElement, LineElement, PointElement,
  CategoryScale, LinearScale, Legend, Title, Tooltip,
);
setupChartjsWith(Chart, { tool: 'plot_sales' });
```

`setupChartjsWith` takes the `Chart` class, or a `ChartjsLoader` — a function returning a promise
of it, or of a module carrying it (`() => import('chart.js/auto')`). Anything constructed like
`ChartjsConstructor` and returning a `ChartjsChart` (`options`, `data`, `update`, `resize`,
`destroy`) will do. A chart of a type you did not register shows the note. Both functions return a
disposer that unregisters the renderers and releases every chart drawn.

The plugin never touches `Chart.defaults`: other charts on your page are not the chat's, so each
chart gets the chat's look in its own config.

ESM only.
