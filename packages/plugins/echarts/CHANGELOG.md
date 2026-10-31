# @aparte/plugin-echarts

## 0.29.3

## 0.29.2

## 0.29.1

## 0.29.0

### Minor Changes

- 324d2ba: New package: `@aparte/plugin-echarts` draws the ` ```echarts ` fences a model writes, and a tool's result, as Apache ECharts charts. Call `setupECharts()`; pass `tool` (and `map`) to draw a tool's result in place of its row.

  The fence's body is ECharts' own `option` as JSON, drawn while it streams from the part that has arrived, at most every 300 ms. The chart wears the chat's tokens as an ECharts theme, recoloured in place on a light/dark switch, with series colours that stay apart for colour-blind readers. It is drawn as SVG, as a `figure` with ECharts' own description and a hidden table of its numbers. A model's option cannot write HTML, load a picture, open a link or download a file: tooltips are forced to rich text; images, links, `saveAsImage`, `dataView`, a CSS `url()` however it is spelled and a dataset filter's regular expression are taken out; a colour key takes colour syntax only (`sanitizeEChartsOption`). ECharts is loaded on the first chart, and `@aparte/plugin-echarts/core` takes an ECharts build you hand it (`setupEChartsWith`).
