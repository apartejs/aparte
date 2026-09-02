---
"@aparte/core": patch
---

Retry and edit no longer put empty assistant turns on the wire: a failed turn, or one stopped before its first token, is dropped the same way send drops it.

Send, retry and edit all answer the same question — what did this conversation say so far? — and they answered it with two different pieces of code. Send filtered out errored turns and anything whose wire text came out empty; retry and edit kept every user and assistant row whatever its status, so a failed turn reached the model as `{ role: 'assistant', content: '' }`. Some providers reject that outright; the rest read it as an empty reply worth imitating.

The slice stays each caller's own business — retry cuts before the reply it regenerates, edit after the message being reworded, send at the last answered turn. What a message contributes to the wire is now one rule the three of them share.
