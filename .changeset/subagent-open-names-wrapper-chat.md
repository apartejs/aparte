---
'@aparte/plugin-subagents': patch
---

`aparte-subagent-open` now names its chat in `targetId` under a framework wrapper too, not only inside `<aparte-chat>`.

The line looked for the `<aparte-chat>` tag, and the React, Vue and Svelte wrappers render a `[data-aparte-chat]` root instead, so on those three the event came without the chat's id. It now finds its chat the way every chat-scoped event does (`chatIdOf`).
