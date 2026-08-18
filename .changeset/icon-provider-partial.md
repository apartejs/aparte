---
"@aparte/core": patch
---

A partial `AparteIconProvider` no longer breaks the bubble action bar. `getIcon()`
always fell back to the built-in SVGs for icons a provider didn't implement, but
`getIconProvider()` — what the action bar reads, calling each icon directly —
handed back the registered provider verbatim, so a provider covering only some
icons threw `icons.retry is not a function`. It now returns a complete set,
falling back per icon.

Consequently every key on `AparteIconProvider` is now optional, which is what the
runtime always supported (and what the interface's own example showed). Full
providers keep type-checking unchanged; partial ones stop needing `as any`.
