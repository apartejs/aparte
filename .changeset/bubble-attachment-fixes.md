---
"@aparte/core": patch
---

Two attachment-rendering fixes in the message bubble:

- **Alignment**: a user message's attachment strip was anchored to the trailing
  edge while the user bubble hugs its text on the leading edge — one message
  split across both sides of the transcript (a chip on the right, the text
  bubble on the left). The strip now shares the bubble's edge.
- **Standalone `appendMessage()`**: the viewport created the bubble from
  attributes only, silently dropping the message's `attachments`, `segments`
  and `usage`. It now runs the same `populateBubbleFromMessage` sync the
  framework-managed path uses, so an imperatively appended message renders in
  full (bring-your-own-loop consumers were getting text-only bubbles).
