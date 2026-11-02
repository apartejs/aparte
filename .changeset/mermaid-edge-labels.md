---
"@aparte/plugin-mermaid": patch
---

A diagram's edge labels no longer look struck through: the line stops at the label.

With SVG labels, Mermaid's own stylesheet draws an edge label's background at half opacity, so the edge ran through the words. The plugin now adds `.edgeLabel rect { opacity: 1; }` to the `themeCSS` it renders with, after any `themeCSS` you pass. The background is the colour a drawing sits on (`--aparte-bg`), so the label shows no box.
