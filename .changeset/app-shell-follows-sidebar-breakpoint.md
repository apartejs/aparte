---
'@aparte/core': patch
---

The app shell now folds to one column when `<aparte-sidebar>` becomes a drawer, at the sidebar's own `breakpoint`, instead of at a fixed 48rem; a sidebar with `breakpoint="30rem"` stays a column between 30 and 48rem.

The shell hid every sidebar that was not a drawer under 48rem, so a breakpoint under 48rem left nothing in that band (no column, no drawer, a toggle that opened nothing), and one over 48rem left a drawer beside an empty first column. The header's toggle now shows while the shell holds a drawer, at any width. Under 48rem the class-only recipe and a sidebar that has not upgraded yet still fold out of the flow, as before.
