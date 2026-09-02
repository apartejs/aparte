---
"@aparte/core": patch
---

`center-empty` centres the welcome group itself: while the chat is empty the viewport takes no block room (`max-block-size: 0; overflow: hidden`), in core and framework mode alike.

Measured on the built demo at 768: the chat's centre at 240, the visible group's at 256. The empty viewport still stood 32px tall — its container's block padding — and `justify-content: center` centred three items of which the first was invisible. The clip is also what makes the flex item's automatic minimum 0. Inline geometry is untouched, so the inset the composer reads from the viewport is still measured.
