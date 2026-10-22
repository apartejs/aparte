---
'@aparte/core': patch
---

A compaction is now saved as soon as it is done: the conversation controller listens for `aparte-compact-done` and saves the chat it names.

Until now nothing told the controller: the summary and the dropped turns reached storage at the next message, so a reload in between brought the long transcript back.
