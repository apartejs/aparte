---
'@aparte/core': patch
---

`<aparte-icon>` with a name no icon has now says so once in the console, instead of drawing an empty square in silence.

Nothing to change in your code. `name="plus"` and `name="panel"` draw nothing until registered: the glyphs of `@aparte/core/icons` are SVG strings, not names, and `<aparte-icon>` knows core's names and the ones added with `registerIcons`. The warning names the name and how to register it; it comes once per name, and not for a name registered right after the element mounted. The Icon page now says it, with the `registerIcons` line. The menu recipe's own example named `chevronRight`, which is not one of core's names, so its chevron drew nothing: it now names `nextBranch`.
