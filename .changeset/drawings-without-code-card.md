---
"@aparte/core": minor
"@aparte/plugin-mermaid": patch
---

A chart, a formula or a card drawn from a fenced block no longer sits in a code card once drawn: no header with its language, no copy button. A Mermaid diagram keeps its card and its copy button. A renderer keeps the card with the new `card: true`.

Until now only a rich card dropped the card (`bare: true`); a chart from `@aparte/plugin-echarts` or `@aparte/plugin-chartjs` kept a header saying "ECHARTS" over it, which read as code to a person who sees a chart. Every language a renderer draws now stands for its block once it is drawn, unless the renderer sets `card: true`, as `@aparte/plugin-mermaid` does: a diagram's source is what a reader takes away, to paste into a document or edit. A block not drawn yet, one the renderer passed on, or one that failed keeps the card and its copy button, so its source is never out of reach. `bare` keeps one meaning: the drawing handles its own overflow (a card's carousel), where a chart or a diagram scrolls inside its box. If you styled `.aparte-segment-code[data-aparte-bare]`, it now matches every drawn block without `card`, not only cards. A chart drawn from a tool call never had a code card and is unchanged.
