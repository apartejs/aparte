---
'@aparte/core': patch
---

A transcript that got shorter just after the chat scrolled itself no longer switches auto-follow off; the view no longer stops short of the bottom at the end of a reply on a slow WebKit.

The viewport reads a `scrollTop` decrease on a shorter transcript, within a second of its own scroll and with no reader input, as the engine clamping to a smaller maximum — the rule its own comment states. The code only applied it within 100 ms of a transcript mutation it had observed. Measured on CI WebKit: a settling reply dipped (1201 → 1068 px at the event), WebKit clamped 666 → 419, and the scroll event came 104 ms after the last mutation — so it was read as the reader going up, and the view stayed 409 px short for good. A jump with no shrink behind it, a reader's hand, a held pointer and a jump outside that second still disarm as before.
