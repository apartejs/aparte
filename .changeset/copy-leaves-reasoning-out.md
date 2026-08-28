---
"@aparte/core": patch
---

The bubble's copy button copies the reply without its reasoning block.

It joined every segment's content, so a reply that opened with a `thinking` segment pasted the model's deliberation above the answer. The client already keeps that block out of the history it sends back, for the same reason; the two rules for "what the reply is" now agree.
