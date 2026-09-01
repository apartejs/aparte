---
"@aparte/core": patch
---

The documented `@cssprop` defaults now match the stylesheets (61 of 172 were stale), and the reflected state attributes the shipped CSS keys off — `data-empty` on the chat, `data-panel-active`/`data-panel-mode`/`data-model-gated` on the composer, `data-busy` on the viewport — appear in each element's attribute table like their siblings already did.

The default in a JSDoc tag is a hand copy of a value that lives in a sheet, and the two had drifted: radii off by half, paddings in pixels where the sheet reads the spacing scale, the attachment tile documented at 40px on one page and 56px on another when the theme says 72px. The generated component pages print that default, so a reader tuning a knob started from a value the sheet never had. Every default is now the stylesheet's value character for character, and a test keeps it so (the source of truth is a `:root` declaration in theme.css, else a scoped declaration, else the fallback of the `var()` that reads the knob). Also on the chat page, the hand-composed markup example no longer ends up inside the `--aparte-chat-bottom-gap` table cell, and the sidebar's `data-drawer` is documented against `breakpoint` rather than a hard-coded 48rem.
