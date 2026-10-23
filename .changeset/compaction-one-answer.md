---
'@aparte/plugin-compaction': patch
---

With a global compaction setup and a chat's own setup on one page, each chat is now summarised once, by the setup on its own configuration; an instance setup no longer answers a chat on the global configuration when a global setup exists.

An unscoped setup on a configuration of its own answered every chat that resolved the global configuration too, so a global chat got two summaries, one from the wrong model. A chat is now answered by its own configuration's setup, and only when that configuration has none by another.

Two cases follow the same rule: a chat a setup is scoped to (`scopeToTargetId`) is answered by that setup alone, and a chat that is not on the page (a transcript in a store) is answered by the setup whose own `resolveTarget` knows it. A request for a chat that no setup knows is still answered by one, which reports the chat it could not find. With no setup on the global configuration, a chat on it is answered by the first setup that answers for a whole configuration, no longer by each of them.
