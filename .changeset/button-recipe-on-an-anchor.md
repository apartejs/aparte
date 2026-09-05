---
"@aparte/core": patch
---

`aparte-btn` on an `<a>` no longer shows the browser's underline; nothing to change unless you relied on it.

The recipe is documented as classes for your own elements, and a settings page reached by a link is the first thing a site puts it on. The UA stylesheet underlines an anchor and no rule of the recipe said otherwise, so the link rendered as underlined text beside an icon button. The reset now lives in the recipe.
