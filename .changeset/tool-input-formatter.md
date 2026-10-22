---
'@aparte/core': minor
---

New `registerToolInputFormatter(toolName, (input) => text)`: the approval panel and the default tool row show a tool's arguments as that text instead of the JSON the model sent, the same text on both.

Without a formatter both still show pretty-printed JSON. The text is written as text, never markup, and a formatter that throws falls back to the JSON. `getToolInputFormatter` and `unregisterToolInputFormatter` go with it; `reset()` clears them.
