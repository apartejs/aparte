---
'@aparte/core': patch
---

A question or approval panel opened by a turn the person did not start no longer steals the focus: it takes it only from someone who is in that chat.

The panel focused itself on every open, so a scripted run (a demo, a turn your code starts, an agent resuming on the server) scrolled the page to the chat and left the focus there. It now moves the focus into the panel only when it was inside the chat before (the composer, a suggestion chip, a button of the transcript), and gives it back on close as before. Elsewhere on the page, or nowhere, the focus stays where it is.
