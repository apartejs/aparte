---
"@aparte/core": patch
---

Docs: the theming guide shows how to rebrand the dark palette so that it wins in every case. Use `:root:root[data-aparte-theme="dark"]`, plus the same pair under `prefers-color-scheme`. A bare `[data-aparte-theme="dark"]` rule lost to core's own dark block on a dark OS.

Core's stylesheet is unchanged. The recipe weighs one step more than core at every level, so it wins whatever order the sheets load in; under Vite dev, core's sheets are injected after the page's own. The guide's light rebrand now says to write `:root:root` for the same reason.
