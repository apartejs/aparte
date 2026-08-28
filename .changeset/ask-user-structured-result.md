---
"@aparte/core": minor
---

A tool result can carry a structured value beside its prose: `AparteToolResult.structuredContent` (MCP's name for exactly this field) travels with the call and lands on the transcript's segment as `AparteToolCallSegment.structuredResult`. `content` is unchanged — it stays what the model reads.

The composer's send button no longer "advances" through a form of several questions: it means *submit* throughout, enabled once every question has an answer, and the chips are the navigation (that was already true — the chevron was a second way to do what a chip does). `AparteComposerPanelMode` loses `'advance'` and the locale key `elicitationNext` is removed. An answered chip now carries a check mark, and a `recommended` option a "Recommended" tag (new locale key `elicitationRecommended`).

Measured against the reference product: Claude Code's question panel switches questions by tab and submits everything with one button; a click selects and never submits. Ours did the same in a form, except for the button that pretended to be a "Next".
