---
'@aparte/core': patch
---

A tap on a conversation row while the app updates the list now selects that row.

The list holds the app's render during a press so a row is not replaced under it, and lifted the hold one task after `pointerup`, where a mouse click already landed. A tap's click comes later, so the held render could replace the row under the finger first. A touch press now holds the render until its click, or 600 ms if none comes.
