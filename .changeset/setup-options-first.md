---
"@aparte/plugin-ask-user": minor
"@aparte/plugin-approval": minor
---

`setupAskUser` and `setupApproval` now take their options first and the config last, like every other `setup*` — `setupAskUser({ maxOptions: 6 })`, `setupApproval({ classify })`, and `setupAskUser({}, config)` for a scoped chat. `setupAskUser(config, options)` and `setupApproval(config, options)` no longer compile.

The plugins overview stated the rule ("every `setup*` takes the config instance as its last argument, defaulting to the global") and these two broke it; the leading `undefined` the ask-user page had to write to reach the options was the symptom. Pre-1.0, a rename is a rename.
