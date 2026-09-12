---
"@aparte/plugin-shiki": patch
---

A light/dark theme pair now follows the OS colour scheme when the page sets no `data-aparte-theme`, the way core's own theme does; nothing to change on your side.

The pair's stylesheet keyed its dark half on `[data-aparte-theme="dark"]` alone, so a page in system dark — every page that sets no attribute — rendered the light theme's white block on a dark bubble. The dark half now also applies under `prefers-color-scheme: dark` unless the root says `light`, the same three states core answers.
