---
"@aparte/engine": minor
---

`StreamToolConfig.needsApproval` accepts a predicate `(call) => boolean` beside the boolean, so the gate can be decided per call from the arguments; and an approval resolver may return `reason`, a refusal the loop hands the model verbatim instead of "The user rejected this tool call".

Both serve a policy that refuses on its own (a plan mode): without the predicate, every call would have to pause and be auto-approved, painting *awaiting approval* on rows nobody was asked about; without `reason`, the model would be told a person refused when a mode did.
