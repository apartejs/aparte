---
'@aparte/plugin-subagents': patch
---

A view disconnected from its chat, or shown a new conversation, follows the sub-agent it is named again, on whatever call it runs.

`connectSubagentView` keeps a view on the call of the line pressed, since two sub-agents of one reply can share an id. That filter outlived the connection and the conversation: a sub-agent named on the view afterwards, on another call, was never drawn live.
