---
"@aparte/core": patch
---

The approval question names the call as its row does — the label and what it targets — instead of the bare identifier.

"Run {tool}?" substituted the tool's identifier whatever the app had declared, while the row could read "Delete a file a.ts". `{tool}` is now the row's own line: the declared label (else the identifier), then the summary's target. The arguments block is unchanged. With labels that are actions, `approvalAsk` is the lever for the wording ("Allow {tool}?").
