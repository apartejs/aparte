---
'@aparte/plugin-compaction': major
---

A `CompactionTarget` must have `updateMessage`, and the type now says so; `clearAll` and `appendMessage` leave it. The `window` of an `aparte-compact` request is no longer read: set `contextWindow`.

Since 0.26.0 a compaction writes one checkpoint through `updateMessage` and calls nothing else, so a target without it already failed at run time ("This chat cannot hold a checkpoint") while the type called it optional. The `window` a context gauge sent with its request was read as a last resort "for one more release" from 0.26.0; the gauge no longer sends one.
