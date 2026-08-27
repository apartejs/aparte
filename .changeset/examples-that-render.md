---
'@aparte/core': patch
---

The examples in the docs' live frames render something.

Nine previews on the generated reference pages were empty, half-empty or nonsense, and
they were all the same defect: an example written to be READ, rendered as a DEMO.

Eight of them contained a literal `…` as placeholder prose — `<svg class="aparte-icon"
viewBox="0 0 24 24">…</svg>`, `<button class="aparte-btn aparte-btn--icon">…</button>`,
and six more. That reads perfectly as "your content here" in a code block. Lifted verbatim
into the live iframe beside it, it draws nothing: `/preview/class/icon/` was a completely
blank frame, the thumbnail preview an empty box next to a box containing three dots.

The ninth was `<aparte-chat>`, whose `@example` showed the element's two forms — default
and hand-composed — one after the other, each at `height: 600px`. Every element-own example
is concatenated into ONE frame, so the flagship element's page rendered two empty chats
with 600px of nothing between them. It is now one chat, 320px, seeded with a real exchange;
the hand-composed form moved into the class prose as a fenced block, where it is read and
not mounted.

The invariant that caused this is deliberate and stays: the frame and the code block read
the same string, so a demo can never drift from the example above it. What changes is that
the examples are now written for both readers at once.

Found by photographing all 29 `/preview/*` routes and looking at them.
