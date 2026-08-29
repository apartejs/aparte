---
"@aparte/provider-scenario": patch
---

A `match()` that returns something other than a scenario key — the scenario object, an unknown name — is said in the console, naming what it returned and the keys the provider knows, instead of streaming an empty turn in silence ("Typing…" forever, issue #29). The value-branching pattern — the tool's result carries the answer, `match` reads it back from the last `tool_result` — is documented.
