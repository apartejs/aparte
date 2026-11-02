---
'@aparte/core': patch
---

The scroll rail now follows the reader through long replies, is a single Tab stop, and no longer slows a streaming reply in a long conversation.

- **The current mark follows the reader.** It stayed on the last question while the reader scrolled up through long replies (seven questions up, in Chromium), and one question behind once the layout settled after a scroll. The reading band now watches the replies too, and a reply in it is read under its question.
- **One Tab stop.** Every tick was a button in the tab order: 500 of them between the transcript and the composer of a 1000-message conversation. The rail now takes one, the current tick; the arrow keys, Home and End move inside it.
- **A streaming reply no longer rebuilds the rail.** It reconciled every tick once a frame: 10.8 ms a frame at 500 questions. It now rebuilds when bubbles come or go, once per reply, and a message whose text changes re-names only its own tick.
- **A tick that stays is not moved.** At the viewport's 1000-bubble cap, each turn removed and re-inserted every tick, and a focused tick lost the focus.
- **The pitch loosens again.** After a long conversation, a short one kept ticks 6px apart where 24px fit.
- A bubble whose `message-id` or `data-role` changes in place is followed, and keeps the mark.
- `jumpTo()` with a reply's id marks the question it answers, as the scroll does.
