---
"@aparte/provider-scenario": minor
---

New package: `@aparte/provider-scenario`, a scripted model. `createScenarioProvider({ turns })` answers the model's calls in order; `createScenarioProvider({ scenarios })` picks a named turn by `when` (the last user message) or `after` (a tool's result). A turn is text streamed at a typing pace, thinking, a tool call the real loop runs, an error, a pause, a usage override. `showcase` is a ready-made set covering the whole surface of a chat. No key, no network, no dependency of its own.

Three things in this repository had written it by hand: the browser suite's wire mock, the UI audit's screenshot harness, the docs' live frames. It is also the piece nobody ships for consumers — a deterministic model for their own tests, and a demo that streams without a backend. The repository's browser suite keeps its network mock on purpose: it tests the wire path this provider bypasses.
