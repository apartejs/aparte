# @aparte/plugin-mermaid

## 1.5.0

## 1.4.0

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

- 97ca78b: A diagram's edge labels no longer look struck through: the line stops at the label.

  With SVG labels, Mermaid's own stylesheet draws an edge label's background at half opacity, so the edge ran through the words. The plugin now adds `.edgeLabel rect { opacity: 1; }` to the `themeCSS` it renders with, after any `themeCSS` you pass. The background is the colour a drawing sits on (`--aparte-bg`), so the label shows no box.

- 67efebe: A diagram's labels can no longer load a picture: Mermaid's sanitizer now refuses pictures, players, frames and styles in every label it writes as HTML, and a diagram's `%%{init}%%` cannot lift that.

  An architecture service's icon text is written as HTML even with HTML labels off, and Mermaid draws in the page to measure a diagram before the plugin turns it into an image, so `service s1 "<img src=https://…>"` fetched that address with no click. The rule goes through Mermaid's own `dompurifyConfig`, which covers every such label rather than the one diagram type.

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

### Patch Changes

- 8304712: A chart, a formula or a card drawn from a fenced block no longer sits in a code card once drawn: no header with its language, no copy button. A Mermaid diagram keeps its card and its copy button. A renderer keeps the card with the new `card: true`.

  Until now only a rich card dropped the card (`bare: true`); a chart from `@aparte/plugin-echarts` or `@aparte/plugin-chartjs` kept a header saying "ECHARTS" over it, which read as code to a person who sees a chart. Every language a renderer draws now stands for its block once it is drawn, unless the renderer sets `card: true`, as `@aparte/plugin-mermaid` does: a diagram's source is what a reader takes away, to paste into a document or edit. A block not drawn yet, one the renderer passed on, or one that failed keeps the card and its copy button, so its source is never out of reach. `bare` keeps one meaning: the drawing handles its own overflow (a card's carousel), where a chart or a diagram scrolls inside its box. If you styled `.aparte-segment-code[data-aparte-bare]`, it now matches every drawn block without `card`, not only cards. A chart drawn from a tool call never had a code card and is unchanged.

## 0.31.0

## 0.30.1

## 0.30.0

## 0.29.4

## 0.29.3

## 0.29.2

## 0.29.1

## 0.29.0

## 0.28.3

## 0.28.2

## 0.28.1

### Patch Changes

- 9a2ce96: A diagram still arriving now shows a placeholder box instead of its source, then draws each node as soon as its line is complete; it no longer flashes an empty image.

  Before, a fence streamed its Mermaid source as text, then the header alone (`flowchart LR`, an `accTitle`) drew an empty 16×16 image in its place, and nothing changed until the whole of a half-written line parsed: characters, then a blank, then the diagram. Now its first frame is the skeleton recipe, each later frame draws the source up to its last complete line, and a frame whose drawing would paint nothing keeps what is shown. A closed fence is drawn as before; `progressive: false` still waits for it.

## 0.28.0

### Minor Changes

- 8c4cd8f: New package: `@aparte/plugin-mermaid` draws the ` ```mermaid ` fences a model writes as diagrams. Call `setupMermaid()`.

  It works with any Markdown provider, or none: every fence in a streamed reply is already a block of its own. The diagram is redrawn as its fence arrives, at most every 300 ms, keeping the last version that parsed; once the fence closes, one that does not parse shows a note and its source. Each diagram is an `<img>` of its SVG, so no script or style a model wrote into it can reach the page, and Mermaid runs with `securityLevel: 'strict'` and HTML labels off, which a diagram's own `%%{init}%%` cannot change. Colours follow the chat's theme. Mermaid is loaded on the first diagram, a diagram is drawn only once it comes near the screen, and `@aparte/plugin-mermaid/core` takes a Mermaid you hand it (`setupMermaidWith`).
