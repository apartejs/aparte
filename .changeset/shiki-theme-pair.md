---
"@aparte/plugin-shiki": minor
---

`theme` accepts a `{ light, dark }` pair on both entries; the code block then follows core's `[data-aparte-theme="dark"]` switch. A single theme works exactly as before.

One theme paints one scheme, so `github-dark` — the default — stayed a dark slab inside a light chat, and no option could say otherwise: the plugin's most visible gap. With a pair, shiki renders both colours per token as CSS variables (`--shiki-light` / `--shiki-dark`, its own dual-theme output, `defaultColor: false`) and the plugin adds one small stylesheet that picks the one the theme attribute asks for. Core learns nothing about shiki: the attribute is core's public theme contract, the variables are shiki's.
