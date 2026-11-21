---
'@aparte/core': patch
'@aparte/plugin-cards': patch
---

In a right-to-left chat, a reasoning block written in English keeps its indent beside its rail, and the compact weather card and the link chip pad the right side.

The reasoning panel reads its own direction (`dir="auto"`), so English reasoning in an Arabic chat put its indent on the left while the rail, which follows the chat, is on the right. When the two directions differ, the indent now goes on the rail's side. The weather card's extra space for its accent bar and the link chip's tighter icon side were physical paddings: they are logical now.
