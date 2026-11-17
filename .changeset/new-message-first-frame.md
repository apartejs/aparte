---
'@aparte/core': patch
---

A new message no longer flashes 320px tall for a frame before taking its own height.

Nothing to change in your code. The bubbles skip drawing what is off screen (`content-visibility: auto`), and one that has never been drawn is laid out at the 320px fallback. A message just appended lands below the fold until the scroll catches up a frame later, so the transcript was pinned to that height and then snapped back: a flash under the person's message, the reply, or a message the app appended (an advisor's, a notice). The newest two bubbles are now always drawn (`aparte-chat-bubble:nth-last-of-type(-n + 2)`); the history above keeps the skipping.
