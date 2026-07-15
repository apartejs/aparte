---
"@aparte/core": minor
---

Give the base chat container layout to both host shapes core already recognises,
from one rule. Core resolves the chat host via the selector
`aparte-chat, [data-aparte-chat]` (the vanilla `<aparte-chat>` element and the
`<div data-aparte-chat>` roots the framework wrappers render); the base
flex-column layout (fill the parent, viewport scrolls internally, composer pinned
to the bottom) now keys on that same selector in `aparte.css`. This fixes React,
whose wrapper container previously had no base layout, and lets the Vue and Svelte
wrappers drop their scoped component CSS — every wrapper gets consistent layout
from the one stylesheet consumers already import, with no wrapper-specific class.
