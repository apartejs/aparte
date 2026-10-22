---
'@aparte/plugin-compaction': patch
---

With a global compaction setup and a chat's own setup on one page, each chat is now summarised once, by the setup on its own configuration; an instance setup no longer answers a chat on the global configuration when a global setup exists.

An unscoped setup on a configuration of its own answered every chat that resolved the global configuration too, so a global chat got two summaries, one from the wrong model. A chat is now answered by its own configuration's setup, and only when that configuration has none by another.
