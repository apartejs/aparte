---
'@aparte/plugin-shiki': patch
---

A light/dark theme pair now follows the nearest `data-aparte-theme`, not the page: a chat set light inside a dark page gets the light code theme.

Both rules of the pair's stylesheet matched any ancestor — `[data-aparte-theme="dark"] .shiki`, and the system-dark one on `:root` — so a chat forced light kept dark code. The stylesheet now reads `light-dark()`, which follows the `color-scheme` core sets on the nearest `[data-aparte-theme]`. Measured in Chromium, WebKit and Firefox. A browser without `light-dark()` keeps the page-level rules.
