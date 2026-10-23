---
'@aparte/core': minor
---

New `registerToolInputFormatter(toolName, (input) => text)`: the approval panel and the default tool row show a tool's arguments as that text instead of the JSON the model sent, the same text on both.

Both read it from the chat's configuration, so a chat with its own (`attachConfig`, a wrapper's `config` prop) takes the formatter registered there. Without a formatter both still show pretty-printed JSON. The text is written as text, never markup, and a formatter that throws falls back to the JSON. `getToolInputFormatter` and `unregisterToolInputFormatter` go with it; `reset()` clears them.
