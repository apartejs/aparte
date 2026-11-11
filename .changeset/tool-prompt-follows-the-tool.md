---
'@aparte/core': patch
---

A tool's `systemPrompt` is no longer sent when the tool is not: for a model without `function_calling`, or a request sent with `toolChoice: 'none'`.

Core already left the tools out of those requests, but kept their instructions in the system message, so a model with no `create_artifact` (or any other tool) was still told to use it, and could describe a call it cannot make. `config.resolveToolSystemPrompts()` takes the tools a request carries and returns only theirs; called without an argument it still returns every registered tool's. The context gauge counts the same way. Nothing to change in your code.
