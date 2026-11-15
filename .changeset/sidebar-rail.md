---
'@aparte/core': minor
---

`<aparte-sidebar collapsed="rail">` folds the column to a 56px rail that stays usable, and `.aparte-tooltip-anchor--hover` shows a tooltip on hover and focus with no script.

Nothing to change in your code: a plain `collapsed` still folds to nothing, and an anchor without the modifier behaves as before. In a rail the children you mark `data-rail` stay, the others and any `.aparte-sidebar__label` or `.aparte-sidebar__brand` inside a marked one hide, and the sidebar takes no `inert`. The width is `--aparte-sidebar-rail-width`; the tooltip's delay is `--aparte-tooltip-delay` (400ms). The rail has no keyboard shortcut and the element does not choose when to be one: your toggle sets the attribute.
