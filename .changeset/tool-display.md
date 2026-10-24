---
"@aparte/core": minor
---

Describe how a tool's calls are shown with `registerToolDisplay(name | RegExp | '*', { label, icon, summary, formatInput, hidden, open })`; `registerToolRenderer`, `registerToolSummary` and `registerToolInputFormatter` accept the same patterns and `'*'`.

`'*'` means every tool nothing more specific describes, and an MCP server's dynamic names (`mcp__github__…`) can be described with a RegExp. One entry per matcher; calls merge into it; the entry that applies is the exact name's, else the first pattern registered, else `'*'`'s — whole, never a mix. Registering a display tells the chats on the page, so a label reaches rows already drawn.

On the row, `label` replaces the identifier (in the chat's font), `icon` is an icon-provider key (unknown keys fall back to `tool`), and the identifier stays on the row as `data-tool-name`. Without a display the row reads as it did: core never turns an identifier into words. `registerToolSummary` and `registerToolInputFormatter` are now the `summary` and `formatInput` fields of that entry; `getToolSummary` and `getToolInputFormatter` resolve patterns too.

A tool renderer's stylesheet is injected once per renderer, not once per tool name.
