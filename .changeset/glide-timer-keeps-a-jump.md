---
'@aparte/core': patch
---

Scrolling the transcript up by script (`scrollTop = 0`, `scrollIntoView`) right after a send is no longer undone: the view stays where it was moved instead of snapping back to the bottom.

A send glides to the bottom and arms a timer that pins the view if the glide stopped short. When the timer fired in the same instant as a jump up, before the scroll event had been read, it took the jump for a short glide and pinned it back. It now leaves any move up to the scroll handler, which tells a reader's or a host's jump from the layout's.
