---
"@aparte/core": patch
---

Escape three more consumer/stream-supplied fields that reached innerHTML unescaped: the
composer action `label` and input `placeholder` (attribute positions) and a `message-id`
CSS attribute-selector in the viewport (now `cssEscape`d like its siblings). Harden the
bubble / conversation-list / attachment escape helpers to also escape `'`. Add a
best-effort `.catch` to the fire-and-forget syntax-highlight and clipboard promises so a
rejecting highlighter or clipboard write degrades silently instead of an unhandled rejection.
