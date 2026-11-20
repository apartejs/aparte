---
'@aparte/core': patch
'@aparte/plugin-subagents': patch
---

A reply, or a sub-agent's conversation, no longer loses its last words when the server sends no `text-flush` before the next call or the run's end.

Nothing to change in your code. The stream parser holds a delta that ends on a backtick (or on the start of a block tag) until more arrives, and only `text-flush` handed it over. aparté's own runner sends one at the end of every model call; a server loop of one's own may not (apartejs/aparte#275). Then a reply ending on inline code lost it, and was saved that way: "La valeur est `42`" in one delta showed nothing at all. The text is now handed over at every `turn-start` and at the run's end (done, suspended, stopped), and a sub-agent's at its own end and at the run's; after a `text-flush` there is nothing left to hand over, so nothing appears twice. The server-loop guide's wire example closes each call with `text-flush`.
