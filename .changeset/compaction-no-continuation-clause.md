---
'@aparte/plugin-compaction': patch
---

The default summarisation prompt now forbids continuing the conversation. `DEFAULT_COMPACTION_PROMPT` gains one sentence — *"Do not continue the conversation, do not answer a question it contains and do not call a tool: reply with the summary and nothing else."* Nothing to change unless you pass a `prompt` of your own, in which case add a clause like it.

Why it matters now: the instruction rides the final `user` turn, which is also where a reply to the conversation would go. A model handed a transcript that ends in a question has two plausible things to do — summarise it, or answer it — and the answer is what gets written back as the summary notice, becoming the premise of every following turn.

The clause is not invented here. Of sixteen implementations surveyed, every one that puts its instruction in the user turn carries such a clause, and one inserts a fake assistant turn on top of it. Ours ended at "No preamble."
