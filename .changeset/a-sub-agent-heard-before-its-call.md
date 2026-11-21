---
'@aparte/plugin-subagents': patch
'@aparte/core': minor
---

A sub-agent heard before it names the call that opened it (an AG-UI agent whose first event arrives before `SUBAGENT_STARTED`) now moves onto that call: one line with all it said, and nothing marked Stopped.

It got a line of its own first, as a sub-agent with no call does. Announced again with its call, it was taken for another sub-agent under the same id: the first line read Stopped and what it said was split across two lines. `createSegmentList` gains `removeSegment`, so a sub-agent's own transcript can take a line out as a reply can.
