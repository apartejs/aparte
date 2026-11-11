# @aparte/plugin-echarts

## 1.3.0

## 1.2.0

## 1.1.2

## 1.1.1

## 1.1.0

## 1.0.2

## 1.0.1

## 1.0.0

### Patch Changes

- bf0b979: A Mermaid diagram with a node picture from a URL (`A@{ img: "https://…" }`) is no longer drawn: it shows its source, since drawing it sent a request to that address from the page. An inline `data:image/…` picture still draws.

  - `@aparte/plugin-mermaid` — Mermaid loads a node's `img:` and a sequence actor's icon in the page while it draws, before the plugin turns the SVG into an image, and `securityLevel: 'strict'` does not cover it. The plugin now asks Mermaid what it parsed (`mermaid.mermaidAPI.getDiagramFromText`, which draws nothing) and shows the source of a diagram holding a picture that is not `data:image/…`, however the source spelled it (a YAML anchor and alias, an escape, `properties`, or `details` reading an element of the page). So a sequence diagram that only says "properties" in a message, or a label that says "img", is drawn. A `mermaid` object without `mermaidAPI` (your own, passed to `setupMermaidWith`) falls back to refusing on the text, which refuses those too. A style a diagram writes is read as well: a CSS `url(`, `image-set(`, `cross-fade(` or `@import` anywhere in the source, or a backslash escape in a source that styles something (`classDef c mask-image:url(https://…)` in a state or block diagram was fetched while the diagram was measured), shows the source. The diagrams page and the README no longer say that nothing in a diagram reaches the page without this.
  - `@aparte/plugin-echarts` — a colour string such as `rgb(` followed by thousands of spaces froze the tab for seconds: the colour check backtracked cubically (4 KB took 15 s). It is now linear, and a colour longer than 64 characters is dropped. A font value under any key with "font" in it (`textFont`, a toolbox icon's `textFontFamily`…) that holds more than a font name is dropped, `textFill` / `textStroke` must be colours, and `image-set(…)` / `cross-fade(…)` in any string is refused: `;mask-image:image-set("https://…")` made the browser fetch the picture as soon as the chart drew. A `cursor` (and a dataZoom's `cursorGrab` / `cursorGrabbing`) that is not a keyword is dropped too: `image-set("https://…")` made the browser fetch the picture when the pointer passed over the chart. `pointer`, `not-allowed` and the other keywords are kept. A symbol written `emptyImage://…` is dropped like `image://…` (ECharts strips `empty` and then draws the picture), in a series, a legend icon, a dataZoom handle, a mark point or a decal. A chart fence that is only open brackets no longer takes seconds to read while it streams: reading what has arrived is linear (40,000 brackets took 5 s, on every frame).
  - `@aparte/plugin-chartjs` — a string in a dataset's own `tooltip.callbacks` or in `options.interaction` (and `external`, `filter`, `itemSort`, an unknown `position`) is dropped like the chart's top-level tooltip ones; it threw on every hover. A tooltip's own `interaction` and `plugins` keys are dropped too (`plugins.tooltip.interaction.external`, `plugins.tooltip.plugins.tooltip.callbacks`): Chart.js resolves a tooltip option through them as well, and neither is an option of the tooltip. A config fence that is only open brackets is read in linear time while it streams (40,000 brackets took 5 s, on every frame).
  - `@aparte/plugin-cards` — the plan card read a step line in quadratic time when it held a long run of spaces (1 s for 50 000 characters); it is linear now, also for a line holding a lone carriage return, which used to throw. The titles it draws are unchanged.

- 2e5c5ab: The READMEs of the plugins and the framework packages now show a picture of what they draw. No code changes: nothing to do on your side.

  Each plugin README that draws something (Markdown, maths, diagrams, both chart libraries, the approval modes, the question panel, artifacts, the model selector, code highlighting, compaction) shows its own demo, taken from the live docs (`https://apartejs.dev/shots/<name>.png`). The four framework packages show an assistant reply with a card, a formula and a chart.

- Updated dependencies [26ddd6c]
- Updated dependencies [e97d464]
- Updated dependencies [0a6dd91]
- Updated dependencies [635f69b]
- Updated dependencies [224afde]
- Updated dependencies [2e5c5ab]
- Updated dependencies [67efebe]
- Updated dependencies [99fcc42]
- Updated dependencies [e97d464]
- Updated dependencies [048864d]
- Updated dependencies [99784ad]
  - @aparte/core@1.0.0

## 0.32.1

## 0.32.0

## 0.31.0

## 0.30.1

## 0.30.0

## 0.29.4

## 0.29.3

## 0.29.2

## 0.29.1

## 0.29.0

### Minor Changes

- 324d2ba: New package: `@aparte/plugin-echarts` draws the ` ```echarts ` fences a model writes, and a tool's result, as Apache ECharts charts. Call `setupECharts()`; pass `tool` (and `map`) to draw a tool's result in place of its row.

  The fence's body is ECharts' own `option` as JSON, drawn while it streams from the part that has arrived, at most every 300 ms. The chart wears the chat's tokens as an ECharts theme, recoloured in place on a light/dark switch, with series colours that stay apart for colour-blind readers. It is drawn as SVG, as a `figure` with ECharts' own description and a hidden table of its numbers. A model's option cannot write HTML, load a picture, open a link or download a file: tooltips are forced to rich text; images, links, `saveAsImage`, `dataView`, a CSS `url()` however it is spelled and a dataset filter's regular expression are taken out; a colour key takes colour syntax only (`sanitizeEChartsOption`). ECharts is loaded on the first chart, and `@aparte/plugin-echarts/core` takes an ECharts build you hand it (`setupEChartsWith`).
