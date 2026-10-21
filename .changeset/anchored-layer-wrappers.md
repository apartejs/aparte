---
'@aparte/core': patch
---

Per-chat theming now works on the React, Vue and Svelte chat root, and your own token overrides on `aparte-chat` win whatever order the stylesheets load in.

The derived layer (the inks, the scales, the bubble colours) is worked out again on `[data-aparte-chat]`, the root the three wrappers render, so a chat given its own `--aparte-primary` there gets its own user bubble and inks. Every anchor of that layer but `:host` now weighs nothing (`:where()`), like the palette: `aparte-chat { --aparte-primary-ink: … }` no longer loses when core's sheet loads after yours, or on a chat that carries `data-aparte-theme`.
