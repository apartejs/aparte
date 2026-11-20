---
'@aparte/core': patch
---

A call in a sub-agent's conversation under its line now shows its own state: a failed or refused call no longer reads in the success colour, and a reply being written has one caret instead of one per paragraph of the transcript.

Nothing to change in your code. Five rules of the tool row (the success ink of a call that is done, the quiet line's target face and chevron place, a queued call's muted name, a running quiet call's state word under reduced motion) were keyed on the row's state with a descendant combinator, so they reached every row drawn under it: with `setupSubagents({ details: 'transcript' })` a failed call in the transcript of a line that was done read "Failed" in green (apartejs/aparte#271), and a quiet line made the calls under it quiet. They now name the row's own line; their specificity is unchanged. The streaming caret (`setStreamingCaret`) had the same reach and blinked after the last paragraph of every text in a transcript; it now stays at the reply's own words.

A browser test now draws every state of a line with a call of every state under it, and compares each call with the same call on its own.
