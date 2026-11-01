---
"@aparte/core": patch
---

`centerWhenEmpty` now centres the empty state and the composer together, as one block; it used to centre the composer alone and give the greeting only the half above it.

The viewport and the spacer under the composer shared the free height half and half, so a welcome
taller than a line got the half above the composer and scrolled under the scroll-to-bottom button:
385px for a 490px welcome in a 919px window, and an attachment took half of its own height off that
too (#151). While the chat is empty, the viewport now takes its content's height (shrinking and
scrolling only when the block does not fit) and a spacer above balances the one below; the first
message slides both away, as before. The hidden scroll-to-bottom button no longer holds 36px under
an empty state. The framework packages only (`.aparte-chat-container--auto-center`);
`<aparte-chat center-empty>` keeps its layout. A host that rebuilt this layout with a grid on the
container's children can drop it.
