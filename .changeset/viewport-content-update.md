---
"@aparte/core": patch
---

Editing a message now updates the bubble that shows it. `AparteChatViewport`
forwarded an atomic `updateMessage()` to the rendered bubble only when the
payload carried `status` or `segments`, so an edit — which sends `{ content }` —
updated the message repo (and therefore the history sent to the model) while the
transcript kept displaying the old wording. `content`, `attachments` and `usage`
updates are forwarded too now.

Standalone/raw-core consumers were affected; framework wrappers re-render bubbles
from their own state, which masked it.
