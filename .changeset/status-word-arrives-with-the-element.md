---
"@aparte/core": patch
---

`<aparte-chat-status>` writes its fallback word into the live region when `visible` arrives, and clears it when `visible` leaves — so a screen reader hears the indicator on every turn, not just in theory.

The word was there already; it was written at the wrong moment. `_render()` put `Typing` in the screen-reader span while the host was still `display: none` (`aparte-chat-status:not([visible])` hides it, and all four wrappers mount the element once and flip the attribute). So the region was never MUTATED while it was exposed: it appeared with its text already in it — the reveal-from-hidden path assistive tech is documented not to announce reliably — and from the second turn on there was not even a reveal-time difference, the string being byte-identical to what was sitting there.

Driving it from visibility makes each turn a real content change on a region that is already on screen, which is the path that announces. Nothing about the look moves: the dots-only line is still dots-only, and when `text` is set the visible span carries it exactly as before, with the screen-reader span left empty so the line is read once.

If you drive the element by hand rather than through a wrapper, `show()`/`hide()` (or the `visible` attribute) is now what puts the word in the region — mounting it without `visible` leaves the region empty, as it should, since the element is not on screen.
