---
"@aparte/core": patch
"@aparte/plugin-mermaid": patch
---

A chart or a diagram drawn from a fenced block no longer sits in a code card: no header with its language, no copy button.

Until now only a rich card dropped the card (`bare: true`); a chart from `@aparte/plugin-echarts` or `@aparte/plugin-chartjs`, or a Mermaid diagram, kept a header saying "ECHARTS" over it, which read as code to a person who sees a chart. Every language a renderer draws now stands for its block. `bare` keeps one meaning: the drawing handles its own overflow (a card's carousel), where a chart or a diagram scrolls inside its box. If you styled `.aparte-segment-code[data-aparte-bare]`, it now matches every drawn block, not only cards.
