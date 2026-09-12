---
"@aparte/core": patch
---

A conversation row's `⋯` menu can be used with a mouse in Safari and every other WebKit browser: a press inside the menu no longer closes it before the click reaches the item. Nothing to change on your side.

WebKit does not move the focus to a button on mousedown. It blurs the element that held it instead — a `focusout` with no `relatedTarget` — before the click is delivered. The menu read that as the focus leaving and closed on the press itself, so with a mouse the confirmation never appeared and no item could be chosen; the keyboard path was unaffected. The menu now holds a press inside it from `pointerdown` to its release and ignores that one blur.
