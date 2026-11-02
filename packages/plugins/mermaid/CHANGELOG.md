# @aparte/plugin-mermaid

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
