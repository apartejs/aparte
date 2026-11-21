---
'@aparte/core': minor
'@aparte/engine': minor
---

An approval policy can rule asynchronously: `setApprovalPolicy` and the server handler's `approvalPolicy` may return a promise, awaited before the call runs, pauses or is refused.

Security fix included: a policy that returned a promise used to let every call run unasked in the page (the promise was taken for a ruling with no verdict, so the gate opened, `needsApproval` tools included), and was ignored on the server, where a `deny` on a tool with no flag let the call run. While a policy rules, the calls the model made after that one wait, as they wait for a person's answer, so the order guarantee holds; a synchronous policy stays synchronous. A promise that rejects asks a person, with the reason on the console. `config.ruleOnToolCall` stays synchronous and answers `ask` for a policy still ruling; the new `config.ruleOnToolCallAsync` waits for it. The engine's `needsApproval` predicate may answer with a promise too. (apartejs/aparte#291)

Code that CALLS a policy (one that wraps `config.getApprovalPolicy()` to compose two) now gets a type whose answer may be a promise: await it, or ask `config.ruleOnToolCallAsync`. A policy you write is unaffected, and `createApprovalPolicy` from `@aparte/plugin-approval` is still typed as ruling at once.
