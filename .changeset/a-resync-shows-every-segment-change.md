---
'@aparte/core': patch
---

In controlled mode (`messages` and `onMessagesChange`), a tool call's new status or result, a card's new data, and any other segment without text now show when the parent hands the message again.

When the message kept the same number of segments, the wrappers' re-sync patched only segments carrying `content`: a call the parent marked resolved kept spinning "Running", and a segment replaced under another id was ignored. The fields a segment changed are now patched, and a replaced segment draws the bubble again.
