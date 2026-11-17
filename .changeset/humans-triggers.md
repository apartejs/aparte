---
'@aparte/plugin-triggers': patch
---

`/retry` now targets the AI's last answer, never a notice or a person's message after it.

When a notice or a person's message follows that answer, regenerating it would drop what came after, and the chat refuses, as its own Regenerate button does.
