---
"@aparte/core": minor
---

New exported helper `filesToAttachments(files)`: turns the `File[]` an
`aparte-send` event carries into the `AparteAttachment[]` a bubble renders (id,
MIME type, object URL, and the raw `File` kept for storage adapters).

This conversion already existed inside `ConversationController`, so framework
wrappers had it — but a raw-core consumer driving `appendMessage()` itself had to
hand-roll object URLs, and silently rendered attachment-less bubbles if it
didn't (the vanilla playground did exactly that). The controller now uses the
same helper, so there is one implementation.
