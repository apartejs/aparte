---
'@aparte/plugin-subagents': patch
---

A sub-agent announced with no call, under the id of one that already finished, now gets its own line instead of writing over the finished one's.

A backend that mints sub-agent ids per run (the engine's default counter) names a resume's first detached sub-agent like the paused run's. A finished sub-agent never resumes, so its id announced again is a new one; only one left waiting or running goes on.
