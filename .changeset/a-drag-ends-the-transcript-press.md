---
'@aparte/core': patch
---

In Safari, dragging text or a link out of the transcript no longer leaves the chat unable to follow the next reply to the bottom.

The transcript holds a press from `pointerdown` to the next `pointerup` or `pointercancel`, and WebKit sends neither after a native drag. The press stayed held for the rest of the turn, and the engine's own settle at the end of a reply read as the reader scrolling up, which stopped the follow. A drag now ends the press, as it already does in the conversation list.
