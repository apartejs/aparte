---
"@aparte/core": minor
---

A per-call approval policy: `config.setApprovalPolicy((call, tool) => ruling)` decides for every tool call whether it runs (`allow`), asks at the composer (`ask`), or is refused with a sentence of its own (`deny` + `reason`). `undefined` leaves the tool's `needsApproval` to decide, as before. New exports `AparteApprovalPolicy` and `AparteApprovalRuling`; `config.getApprovalPolicy()` and `config.ruleOnToolCall(call)` read it back. A host's own `approvalResolver` on `AparteClientOptions` is untouched — it already owns the decision.

`needsApproval` is a declaration about a TOOL; a mode ("plan": read-only, "auto": never ask) is a decision about a CALL, and the same `run_command` can be a read or an execution. The client's default channel consults the policy twice — once to decide whether the call pauses at all, so an allowed call never flashes *awaiting approval*, once to answer — and a refusal by policy reaches the model verbatim, never as "the user rejected this". `@aparte/plugin-approval` builds the four modes on this seam.
