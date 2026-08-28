---
"@aparte/core": patch
---

Scrolling up while a reply streams now sticks: the transcript stops pulling the reader back to the bottom.

Auto-follow was disarmed by the gesture, but a scroll-to-bottom frame queued just before it still ran — and the bottom it reached re-armed auto-follow, so every attempt to read something above the stream lasted one frame. Queued frames now re-check the intent before scrolling. Reaching the bottom again, or pressing the scroll-to-bottom button, re-arms it as before.
