---
'@aparte/plugin-katex': patch
---

Formulas in a sub-agent's conversation under its line are drawn at their own pace again, instead of waiting on each other.

Nothing to change in your code. A formula still arriving is drawn at most once a frame per reply part, and the part was found as a segment of the reply. A sub-agent's text is drawn inside a segment of the reply (the line of the call that opened it), so every formula of its conversation, and of sub-agents writing at once, shared one pace: each answered null while another's turn came. The part is now the nearest segment.
