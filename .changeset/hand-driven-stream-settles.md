---
"@aparte/core": patch
---

A segment streamed with `appendToSegment` now ends with its whole text when the bubble stops streaming; its last characters (a full stop after bold text, for one) were never drawn.

A text segment written to with no `isStreaming` flag goes through the incremental Markdown parser, which holds back what may still open a token until it is told the text is complete. When a stream driven by hand ended by removing the bubble's `streaming` attribute, nothing told the segment, so its held-back tail never showed and the settle pass that re-renders the message through the sanitised one-shot renderer never ran. The bubble now marks every segment it was still writing as finished when it stops streaming. A segment its writer already settled (`updateSegment(id, { isStreaming: false })`) and a segment set whole are left as they are.
