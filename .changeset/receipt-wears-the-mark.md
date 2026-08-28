---
"@aparte/plugin-ask-user": minor
---

The question receipt wears core's mark: an answered card carries the success tint and bar on its start edge (`aparte-mark aparte-mark--success`), a declined one the quiet voice (`aparte-mark--quiet`). And a `question-receipt` segment an app emits itself can now say `declined: true` — it renders the outcome alone, the way the tool's own receipt already did.
