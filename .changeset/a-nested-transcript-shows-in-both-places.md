---
'@aparte/plugin-subagents': patch
---

A nested sub-agent's conversation now shows both in the chat and in a view of its parent beside it, instead of moving between the two.

With `details: 'transcript'`, the nested sub-agent's line is drawn inside its parent's transcript in the chat, and again in the view where the parent is opened. Both rows got the one element kept for that sub-agent, so each update moved it into the row that asked, and one of the two was always empty while it wrote. A view of its own now keeps its own elements.
