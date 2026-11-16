---
'@aparte/core': minor
---

A checkpoint can cover the message that carries it: `contextSummary: { …, includesSelf: true }` starts the history after that message, so a summary of everything so far no longer leaves the last answer counted (#246).

A checkpoint reads "from this message on, the summary stands for everything before", so its own message was always read and sent. A host that summarised everything, the last answer included because keeping it would free nothing, had only that answer to put the checkpoint on: the gauge read about full right after a compaction that had freed most of the window, and the next request carried the answer again. With `includesSelf` the history, the gauge and the request start after it, and the separator is drawn under the message rather than above it. It never covers the question being answered: on a last `user` message it reads as an ordinary checkpoint. Retention that hands the checkpoint down to a later message drops the flag, since the inheritor is kept.
