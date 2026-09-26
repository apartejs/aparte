---
"@aparte/core": patch
---

New: `aparteGlobalConfig.registerToolSummary(toolName, (segment) => string)` shows what a call targets after the tool's name in the default row — `read_file skills.json` instead of `read_file` — and keeps the row's states, spinner and disclosure (#91).

Until now the only way to add that line was `registerToolRenderer`, which replaces the whole row: its six states, the spinner, the disclosure and the relabel contract, re-implemented and kept in step with core for one line of text. The summary is keyed by the tool's name, like a renderer, so a display-only chat that registers no `AparteTool` gets it too.

The text is written as text, never parsed as HTML; `''` shows nothing, and a summary that throws shows nothing rather than breaking the row. It is read again on every update of the call, so it follows arguments that are still arriving, and on a config change, so one registered after a row is on screen reaches it. A tool with its own renderer draws its own row and its summary is not read. `unregisterToolSummary` and `getToolSummary` complete the pair, `reset()` clears them, and the `AparteToolSummary` type is exported. The new `.aparte-tool-target` element is muted, in the code font, and cut with an ellipsis, so a long path gives way before the state word does.
