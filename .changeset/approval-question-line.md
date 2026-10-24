---
"@aparte/core": minor
---

The approval question reads "Allow {tool}?" (French "Autoriser {tool} ?") and names the call as its row does — the label and what it targets — instead of the bare identifier.

The question substituted the tool's identifier whatever the app had declared, while the row could read "Delete a file a.ts". `{tool}` is now the row's own line: the declared label (else the identifier), then the summary's target. The default wording changed from "Run {tool}?" to "Allow {tool}?", which reads with a label that is an action ("Allow Write file CHANGELOG.md?") as well as with an identifier; an app that set its own `approvalAsk` keeps it. The arguments block is unchanged.
