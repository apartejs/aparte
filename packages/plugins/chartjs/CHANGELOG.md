# @aparte/plugin-chartjs

## 0.29.4

## 0.29.3

## 0.29.2

## 0.29.1

## 0.29.0

### Minor Changes

- 324d2ba: New package: `@aparte/plugin-chartjs` draws the ` ```chartjs ` fences a model writes, and a tool's result, as Chart.js charts. Call `setupChartjs()`; pass `tool` (and `map`) to draw a tool's result in place of its row.

  The fence's body is Chart.js' own `{ type, data, options }` as JSON (` ```chart.js ` works too), drawn while it streams. Each chart gets the chat's look in its own config — `Chart.defaults` is never touched — and is recoloured on a light/dark switch. It is a `figure` with a hidden table of its numbers. A config from a model carries no code: its own `plugins` list is dropped, and so are strings where Chart.js would call a function and looping animations; its size is bounded — points, labels and datasets by `maxPoints` (5000 by default), a scale to a hundred ticks, the hidden table to 10 000 cells (`readChartConfig` is the reader). `chart.js/auto` is loaded on the first chart, and `@aparte/plugin-chartjs/core` takes a `Chart` you registered yourself (`setupChartjsWith`).
