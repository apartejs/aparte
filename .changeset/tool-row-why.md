---
"@aparte/core": minor
---

The tool row says who refused a call and why it stopped, in the reader's language; a refused row no longer shows the model's sentence as its Output.

A note follows the state word: "You said: “…”" when the person refused and typed instead, "Refused by policy", "Not run: an earlier call was refused", and for a stop "Timed out", "Not available here", "No one could approve it" or "Turn limit reached". A plain Stop needs no note. A refused row shows no Output: its `result` is the sentence written for the model — a policy's reason included — and the person reads the note.

The segment keeps it: `refusal?: { by, instruction? }` and `abortCause?` sit beside `result`, which stays the sentence the model read. `toolRefusal` is exported from `@aparte/core`. A host `approvalResolver` that refuses with a `reason` and no `by` is read as a policy, so its row says "Refused by policy"; return `by: 'person'` if a person refused. New locale keys: `toolRejectedSaid`, `toolRefusedByPolicy`, `toolNotRunAfterRefusal`, `toolTimedOut`, `toolUnavailable`, `toolNoApprover`, `toolTurnLimit`. A segment saved before this keeps its old Output.
