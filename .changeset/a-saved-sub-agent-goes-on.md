---
'@aparte/plugin-subagents': patch
---

A sub-agent saved while it waited now goes on, on its own line, when the reply is resumed after a reload, whether the resumed stream announces it again or not.

After a reload the plugin knew no lane. Events for a sub-agent the resumed stream did not announce again were held until an announcement that never came, then dropped: the transcript kept a call that ran as waiting, then Stopped. Announced again with no call, the sub-agent got a second, empty line. The saved line is now found by the sub-agent's id, on its call or on a segment of its own, while it was waiting or working.
