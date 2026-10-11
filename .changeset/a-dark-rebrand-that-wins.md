---
"@aparte/core": minor
---

Your rebrand now wins over core's palette whichever stylesheet loads first. A `[data-aparte-theme="dark"] { … }` block now wins on a dark OS too (#95). Check one case: if your app sets `data-aparte-theme="dark"` and rebrands only on `:root`, your `:root` colours now apply in that dark mode. Give dark a block of its own, as the theming guide shows under "Rebrand the dark palette".

Core's palette is declared at zero weight (`:where()`) wherever the host owns the choice: the light literals and both attribute blocks. Before, `[data-aparte-theme="dark"]` (0,1,0) lost to core's `prefers-color-scheme` block (0,2,0) on a dark OS. A `:root` rebrand loaded before core lost in light as well, which happens under Vite when the page's stylesheet is a `<link>` in index.html.

The OS block now applies only when no attribute is set, at (0,1,1) (`html:not([data-aparte-theme])`). That weight is chosen. It sits above a bare `:root`, so a rebrand that only knows light stays light-only on a dark OS, and its light colours do not mix with core's dark inks. It sits below `:root:not([data-aparte-theme="light"])`, the guide's selector for a host that follows the OS with a dark palette of its own.

A workaround with more weight, such as `:root[data-aparte-theme="dark"]` or `:root:root`, still works. The extra weight is no longer needed.
