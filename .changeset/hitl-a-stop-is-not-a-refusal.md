---
'@aparte/core': patch
'@aparte/engine': patch
---

Three fixes to the human-in-the-loop gate. No API changes: nothing that compiles today stops compiling.

**A stop is no longer reported to the model as a refusal.** Pressing Stop while a tool waited for approval stamped the segment `rejected` and put "Tool execution was rejected by the user." into the history — the sentence the model reads named a decision nobody made. The abort path resolved `{ approved: false }`, the same value an explicit Reject produces, so the gate could not tell them apart. It now asks the signal instead of the value, and an aborted wait stamps `aborted` and appends no `tool_result`: there is nothing true to tell the model, which is already how a handler aborted mid-run is treated.

**A `needsApproval` tool with no `approvalResolver` aborts instead of inventing a refusal.** `runStreamAgent` defaulted to `async () => ({ approved: false })`, so a host that had simply forgotten to wire a resolver was reported to the model as having refused.

**A reloaded conversation stops waiting for a decision nobody can give.** A `tool_call` persisted as `awaiting-approval` came back still awaiting it, with Approve / Reject buttons wired to a listener that went with the page — and `isSegmentSettled` reads *status* for a tool call, so the segment also stayed open and collected an `endedAt` from the next turn-close. `adoptSegment` now normalises it to `aborted` on every load path: nobody refused it, the page simply went away. The persistence guide documented this as something core could not fix for you; that half of the paragraph is gone, and `pending` — the same defect on the sibling nobody had looked at — is named as still outstanding.

**`AparteToolDecisionDetail.targetId` is declared.** The runtime always sent it and a test read it, so reaching the chat id on a public event required casting past its own type.
