---
"@aparte/core": minor
---

The tool row says who refused a call and why it stopped, in the reader's language; a refused row no longer shows the model's sentence as its Output.

A note follows the state word: "You said: “…”" when the person refused and typed instead, "Refused by policy" (the policy's reason under **Reason** in the detail), "Not run: an earlier call was refused", and for a stop "Timed out", "Not available here", "No one could approve it" or "Turn limit reached". A plain Stop needs no note.

The segment keeps it: `refusal?: { by, instruction? }` and `abortCause?` sit beside `result`, which stays the sentence the model read. `toolRefusal` is exported from `@aparte/core`. New locale keys: `toolRejectedSaid`, `toolRefusedByPolicy`, `toolReason`, `toolNotRunAfterRefusal`, `toolTimedOut`, `toolUnavailable`, `toolNoApprover`, `toolTurnLimit`. A segment saved before this keeps its old Output.
