---
"@aparte/core": minor
---

Escape closes the sidebar drawer from anywhere on the page, opening the drawer moves focus into it, and a collapsed sidebar carries `inert` + `aria-hidden="true"` so it holds no tab stop.

Three halves of one gap. The keydown listener was on the element, so Escape worked only once the focus was already inside the drawer — and nothing put it there, so in the documented shell it did nothing at all. It listens on the document now; the `drawer && !collapsed` guard was always the whole filter.

Opening the drawer moves the focus to its first focusable child, so the next Tab walks the drawer rather than the transcript underneath it, and closing still hands the focus back to the control that opened it.

A collapsed sidebar — folded to nothing as a column, slid off screen as a drawer — now carries `inert` and `aria-hidden="true"`. It was keeping every tab stop and its whole subtree in the accessibility tree while invisible. The element removes only what it wrote, so an `inert` you set yourself (the sidebar behind your own modal) survives a resize.
