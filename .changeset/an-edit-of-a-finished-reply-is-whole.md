---
'@aparte/core': patch
---

Editing a finished reply in place (`updateSegment` with new text) now draws the whole text, its last characters included.

A segment with no `isStreaming` flag (every restored one) was read as still being written on update: the incremental parser wrote it and held back its tail, and nothing ended it since the bubble never streamed. A missing flag now follows the bubble: still writing while it streams, finished when it does not.
