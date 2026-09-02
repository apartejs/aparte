---
"@aparte/core": patch
---

The scroll rail is positioned inside the chat under the Angular wrapper too, and no longer gets pulled back into the flow in overlay mode.

`<aparte-scroll-rail>` is `position: absolute`, so it lands in the nearest positioned ancestor. The recipe hands the shell that containing block with `:has()`, and it listed two of the three shell shapes core's own layout already knows: the vanilla `<aparte-chat>` and the `[data-aparte-chat]` div React/Vue/Svelte render. Angular's host IS `<aparte-chat>` but its shell is the inner `.aparte-chat-container`, and that div carries no attribute — so a rail inside an Angular chat escaped to whatever ancestor happened to be positioned, in the ordinary case the page. `.aparte-chat-container:has(> aparte-scroll-rail)` closes it; the other two wrappers' root already carries both the class and the attribute, so nothing moves for them.

The second half is the same rail, in overlay mode. The bottom-stack rule said `> :not(aparte-chat-viewport)` on the premise that the only child which is not the viewport IS the stack — true when it was written, and the rail made it false: it matched, took `position: relative`, and the one child that floats by design dropped into the flow above the composer. The `:not()` now names both.
