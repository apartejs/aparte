---
"@aparte/plugin-ask-user": minor
---

The question receipt now shows a success tint and a bar on its start edge once answered (`aparte-mark aparte-mark--success`), and a muted, unmarked look when declined (`aparte-mark--quiet`) — core's `aparte-mark` recipe, so it matches the select's chosen option and a checked field choice. And a `question-receipt` segment an app emits itself can now say `declined: true` — it renders the outcome alone, the way the tool's own receipt already did.
